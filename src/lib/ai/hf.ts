// DeepSeek through Hugging Face Inference Providers (OpenAI-compatible router).
// Used when Claude is not available (no ANTHROPIC_API_KEY and no local `claude` CLI), e.g. on Vercel.
// Needs HF_TOKEN: a Hugging Face fine-grained token with "Make calls to Inference Providers".

const ROUTER = "https://router.huggingface.co/v1/chat/completions";

export const HF_MODEL = process.env.HF_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash";

export const hfToken = () => process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";

/** Why the last DeepSeek call failed, in words people can act on (shown in the case, chat and status page). */
export interface HfIssue {
  kind: "credits" | "auth" | "rate" | "other";
  status: number;
  message: string;
  at: string;
}

type G = typeof globalThis & { __meikaHfIssue?: HfIssue | null };
const g = globalThis as G;

export const hfIssue = (): HfIssue | null => g.__meikaHfIssue ?? null;

function noteIssue(status: number, detail: string) {
  const at = new Date().toISOString();
  if (status === 402) {
    g.__meikaHfIssue = { kind: "credits", status, at, message: "Hugging Face credits have run out (HTTP 402). Add pre-paid credits or a PRO plan at huggingface.co/settings/billing." };
  } else if (status === 401 || status === 403) {
    g.__meikaHfIssue = { kind: "auth", status, at, message: `Hugging Face rejected the token (HTTP ${status}). Check HF_TOKEN and its "Inference Providers" permission.` };
  } else if (status === 429) {
    g.__meikaHfIssue = { kind: "rate", status, at, message: "Hugging Face rate limit reached (HTTP 429). Try again in a minute." };
  } else {
    g.__meikaHfIssue = { kind: "other", status, at, message: `DeepSeek on Hugging Face did not answer (${status ? `HTTP ${status}` : "network error"}): ${detail.slice(0, 120)}` };
  }
}

/** DeepSeek R1-style models may prefix their answer with a reasoning block. */
const stripThinking = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

/** Pull a JSON object out of a reply that may be wrapped in ```json fences or prose. */
function extractJSON(text: string): unknown {
  const t = stripThinking(text);
  try {
    return JSON.parse(t);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1];
    const candidate = fenced ?? t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

async function chat(body: Record<string, unknown>, timeoutMs = 120000): Promise<{ status: number; text: string | null; error?: string }> {
  try {
    const res = await fetch(ROUTER, {
      method: "POST",
      headers: { Authorization: `Bearer ${hfToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: HF_MODEL, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const error = (await res.text()).slice(0, 300);
      // a 400/422 is a request-format problem handled by the caller's fallbacks, not an outage
      if (res.status !== 400 && res.status !== 422) noteIssue(res.status, error);
      return { status: res.status, text: null, error };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    g.__meikaHfIssue = null;
    return { status: res.status, text: data.choices?.[0]?.message?.content ?? null };
  } catch (e) {
    noteIssue(0, (e as Error).message);
    return { status: 0, text: null, error: (e as Error).message };
  }
}

/** Structured JSON from DeepSeek. Tries schema-constrained output, then plain JSON mode. Returns the parsed value or null. */
export async function hfJSON(opts: { system: string; prompt: string; jsonSchema: Record<string, unknown> }): Promise<unknown> {
  const messages = [
    {
      role: "system",
      content: `${opts.system}\n\nReply with one JSON object only, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(opts.jsonSchema)}`,
    },
    { role: "user", content: opts.prompt },
  ];
  let r = await chat({
    messages,
    max_tokens: 4000,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: { name: "result", schema: opts.jsonSchema, strict: true } },
  });
  // some providers reject strict schemas (400/422): fall back to JSON mode, then to free text.
  // Auth, billing and rate-limit errors (401/402/403/429) are not worth retrying.
  const retryable = (st: number) => st === 400 || st === 404 || st === 422;
  if (!r.text && retryable(r.status)) {
    r = await chat({ messages, max_tokens: 4000, temperature: 0.2, response_format: { type: "json_object" } });
    if (!r.text && retryable(r.status)) r = await chat({ messages, max_tokens: 4000, temperature: 0.2 });
  }
  if (!r.text) {
    console.error(`[deepseek] request failed (${r.status}): ${r.error ?? "empty reply"}`);
    return null;
  }
  return extractJSON(r.text);
}

/** Free text from DeepSeek. Text-only: image requests return null (callers fall back). */
export async function hfText(opts: { system: string; prompt: string }): Promise<string | null> {
  const r = await chat({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: 1500,
    temperature: 0.3,
  });
  if (!r.text) {
    console.error(`[deepseek] request failed (${r.status}): ${r.error ?? "empty reply"}`);
    return null;
  }
  return stripThinking(r.text) || null;
}

/** Cheapest possible call (one output token), for the status page: null when DeepSeek answers. */
export async function hfProbe(): Promise<HfIssue | null> {
  const r = await chat({ messages: [{ role: "user", content: "ping" }], max_tokens: 1 }, 20000);
  return r.status === 200 ? null : hfIssue();
}
