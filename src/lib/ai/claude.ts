// AI access for the AI-specific features (planning, narration, visual notes, digests).
// Order: Anthropic API (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN) -> local Claude Code CLI (`claude -p`)
//        -> DeepSeek on Hugging Face (HF_TOKEN) -> Groq (GROQ_API_KEY, free tier) -> none.
// Each request tries the configured providers in that order and moves on when one fails
// (e.g. Hugging Face out of credits), so a later provider can still answer.
// Every caller has a deterministic fallback, so the app works with no AI at all.
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { z } from "zod";
import type { CompatProvider } from "./compat";
import { groq } from "./groq";
import { hf } from "./hf";

export type AiProvider = "api" | "cli" | "hf" | "groq" | "none";

const COMPAT: Partial<Record<AiProvider, CompatProvider>> = { hf, groq };

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

let cliAvailable: boolean | null = null;

async function hasCli(): Promise<boolean> {
  if ((process.env.CLAUDE_CLI ?? "auto").toLowerCase() === "off") return false;
  if (cliAvailable !== null) return cliAvailable;
  cliAvailable = await new Promise<boolean>((resolve) => {
    const p = spawn("claude", ["--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return cliAvailable;
}

/** Every configured provider, in the order they are tried. */
export async function aiChain(): Promise<AiProvider[]> {
  const out: AiProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) out.push("api");
  else if (await hasCli()) out.push("cli");
  if (hf.enabled()) out.push("hf");
  if (groq.enabled()) out.push("groq");
  return out;
}

/** The first configured provider (what the app tries first). */
export async function aiProvider(): Promise<AiProvider> {
  return (await aiChain())[0] ?? "none";
}

/** Why no AI answered, e.g. "DeepSeek (Hugging Face): credits have run out … Groq: rate limit reached …", or null. */
export const aiIssue = (): string | null => {
  const msgs = [hf, groq].filter((p) => p.enabled()).map((p) => p.issue()?.message).filter(Boolean);
  return msgs.length ? msgs.join(" ") : null;
};

/** The model a provider uses (for status and labels). */
export const modelFor = (p: AiProvider) => COMPAT[p]?.model ?? MODEL;

/** Checks one provider for the status page: an issue message, or null when it answers (Claude is not probed). */
export async function probeProvider(p: AiProvider): Promise<string | null> {
  const c = COMPAT[p];
  return c ? ((await c.probe())?.message ?? null) : null;
}

/** Display name of a provider. */
export const labelFor = (p: AiProvider) =>
  p === "api" ? "Anthropic API" : p === "cli" ? "local Claude Code" : (COMPAT[p]?.label ?? "off");

let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic());

// ------------------------------------------------------------------ API path

async function apiCall(params: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema?: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<string | null> {
  try {
    const res = await api().beta.messages.create({
      model: MODEL,
      max_tokens: params.maxTokens ?? 16000,
      // Refusal fallbacks: on a policy decline the API re-runs the request on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: params.system,
      output_config: {
        effort: params.effort ?? "medium",
        ...(params.schema ? { format: { type: "json_schema" as const, schema: params.schema } } : {}),
      },
      messages: [{ role: "user", content: params.content }],
    });
    if (res.stop_reason === "refusal") {
      console.warn("[claude] refusal:", res.stop_details?.category ?? "unknown");
      return null;
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return text || null;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error("[claude] authentication failed - check ANTHROPIC_API_KEY");
    else if (error instanceof Anthropic.RateLimitError) console.error("[claude] rate limited");
    else if (error instanceof Anthropic.APIError) console.error(`[claude] API error ${error.status}: ${error.message}`);
    else console.error("[claude] request failed:", error);
    return null;
  }
}

// ------------------------------------------------------------------ CLI path

interface CliResult {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

function cliCall(params: {
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  readDir?: string;
  timeoutMs?: number;
}): Promise<{ text: string | null; structured: unknown }> {
  const args = ["-p", params.prompt, "--output-format", "json", "--no-session-persistence", "--system-prompt", params.system, "--model", MODEL];
  if (params.readDir) args.push("--tools", "Read", "--add-dir", params.readDir);
  else args.push("--tools", "");
  if (params.schema) args.push("--json-schema", JSON.stringify(params.schema));
  return new Promise((resolve) => {
    // Run outside the project so no project CLAUDE.md or settings leak into the call.
    const child = spawn("claude", args, { cwd: os.tmpdir(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), params.timeoutMs ?? 180000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      console.error("[claude-cli] failed to start:", e.message);
      resolve({ text: null, structured: null });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out) as CliResult;
        if (parsed.is_error) {
          console.error("[claude-cli] error result:", String(parsed.result).slice(0, 300));
          return resolve({ text: null, structured: null });
        }
        resolve({ text: parsed.result ?? null, structured: parsed.structured_output ?? null });
      } catch {
        console.error("[claude-cli] unparseable output:", (out || err).slice(0, 300));
        resolve({ text: null, structured: null });
      }
    });
  });
}

// ------------------------------------------------------------------ public helpers

export interface AiResult<T> {
  data: T;
  provider: AiProvider;
  model: string;
}

/** Structured JSON, validated with zod. Tries each configured provider in order; null when none gives valid output. */
export async function aiJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<T> | null> {
  for (const provider of await aiChain()) {
    let raw: unknown = null;
    if (provider === "api") {
      const text = await apiCall({ system: opts.system, content: [{ type: "text", text: opts.prompt }], schema: opts.jsonSchema, effort: opts.effort });
      if (text) {
        try {
          raw = JSON.parse(text);
        } catch {
          raw = null;
        }
      }
    } else if (provider === "cli") {
      const r = await cliCall({ system: opts.system, prompt: opts.prompt, schema: opts.jsonSchema });
      raw = r.structured;
      if (!raw && r.text) {
        try {
          raw = JSON.parse(r.text);
        } catch {
          raw = null;
        }
      }
    } else {
      raw = await COMPAT[provider]!.json({ system: opts.system, prompt: opts.prompt, jsonSchema: opts.jsonSchema });
    }
    const parsed = opts.schema.safeParse(raw);
    if (parsed.success) return { data: parsed.data, provider, model: modelFor(provider) };
    if (raw) console.warn(`[${provider}] output failed validation:`, parsed.error.message.slice(0, 300));
  }
  return null;
}

/** Free text, optionally about local JPEG images (all in one directory). Tries each configured provider in order. */
export async function aiText(opts: {
  system: string;
  prompt: string;
  imagePaths?: string[];
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<string> | null> {
  const images = opts.imagePaths ?? [];
  for (const provider of await aiChain()) {
    if (provider === "api") {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const p of images) {
        const data = (await fs.readFile(p)).toString("base64");
        content.push({ type: "text", text: `Image: ${path.basename(p)}` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
      }
      content.push({ type: "text", text: opts.prompt });
      const text = await apiCall({ system: opts.system, content, effort: opts.effort });
      if (text) return { data: text.trim(), provider, model: MODEL };
    } else if (provider === "cli") {
      const prompt = images.length ? `Use the Read tool to open these images: ${images.join(", ")}. Then: ${opts.prompt}` : opts.prompt;
      const r = await cliCall({ system: opts.system, prompt, readDir: images.length ? path.dirname(images[0]) : undefined });
      if (r.text) return { data: r.text.trim(), provider, model: MODEL };
    } else {
      if (images.length) continue; // DeepSeek and Groq are used text-only here; the Witness shows images without a note
      const text = await COMPAT[provider]!.text({ system: opts.system, prompt: opts.prompt });
      if (text) return { data: text, provider, model: modelFor(provider) };
    }
  }
  return null;
}
