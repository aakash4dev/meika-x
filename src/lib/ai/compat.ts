// A small client for OpenAI-compatible chat APIs (Hugging Face Inference Providers, Groq).
// Each provider keeps its own last failure, worded so people can act on it (credits, token, rate limit).

export interface CompatIssue {
  kind: "credits" | "auth" | "rate" | "other";
  status: number;
  message: string;
  at: string;
}

export interface CompatConfig {
  /** Short id, e.g. "hf" or "groq". */
  id: string;
  /** Shown to people, e.g. "DeepSeek (Hugging Face)". */
  label: string;
  url: string;
  key: () => string;
  model: string;
  /** Where to fix billing or keys, used in messages. */
  billingUrl: string;
  keyName: string;
}

/** Strip reasoning blocks some models (e.g. DeepSeek R1) put before the answer. */
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

type G = typeof globalThis & { __meikaAiIssues?: Record<string, CompatIssue | null> };
const g = globalThis as G;
const issues = (g.__meikaAiIssues ??= {});

export function makeCompatProvider(cfg: CompatConfig) {
  const noteIssue = (status: number, detail: string) => {
    const at = new Date().toISOString();
    const who = cfg.label;
    if (status === 402) issues[cfg.id] = { kind: "credits", status, at, message: `${who}: credits have run out (HTTP 402). Add credits at ${cfg.billingUrl}.` };
    else if (status === 401 || status === 403) issues[cfg.id] = { kind: "auth", status, at, message: `${who}: the key was rejected (HTTP ${status}). Check ${cfg.keyName}.` };
    else if (status === 429) issues[cfg.id] = { kind: "rate", status, at, message: `${who}: rate limit reached (HTTP 429), so the free quota is used up for now. Try again later.` };
    else issues[cfg.id] = { kind: "other", status, at, message: `${who} did not answer (${status ? `HTTP ${status}` : "network error"}): ${detail.slice(0, 120)}` };
  };

  async function chat(body: Record<string, unknown>, timeoutMs = 120000): Promise<{ status: number; text: string | null; error?: string }> {
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const error = (await res.text()).slice(0, 300);
        // 400/422 are request-format problems the callers retry around, not outages
        if (res.status !== 400 && res.status !== 422) noteIssue(res.status, error);
        return { status: res.status, text: null, error };
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      issues[cfg.id] = null;
      return { status: res.status, text: data.choices?.[0]?.message?.content ?? null };
    } catch (e) {
      noteIssue(0, (e as Error).message);
      return { status: 0, text: null, error: (e as Error).message };
    }
  }

  // schema-constrained output -> JSON mode -> free text; auth, billing and rate errors are not retried
  const retryable = (st: number) => st === 400 || st === 404 || st === 422;

  return {
    id: cfg.id,
    label: cfg.label,
    model: cfg.model,
    enabled: () => Boolean(cfg.key()),
    issue: (): CompatIssue | null => issues[cfg.id] ?? null,

    /** Structured JSON matching jsonSchema, or null. */
    async json(opts: { system: string; prompt: string; jsonSchema: Record<string, unknown> }): Promise<unknown> {
      const messages = [
        {
          role: "system",
          content: `${opts.system}\n\nReply with one JSON object only, no prose and no code fences. It must match this JSON Schema:\n${JSON.stringify(opts.jsonSchema)}`,
        },
        { role: "user", content: opts.prompt },
      ];
      const base = { messages, max_tokens: 4000, temperature: 0.2 };
      let r = await chat({ ...base, response_format: { type: "json_schema", json_schema: { name: "result", schema: opts.jsonSchema, strict: true } } });
      if (!r.text && retryable(r.status)) {
        r = await chat({ ...base, response_format: { type: "json_object" } });
        if (!r.text && retryable(r.status)) r = await chat(base);
      }
      if (!r.text) {
        console.error(`[${cfg.id}] request failed (${r.status}): ${r.error ?? "empty reply"}`);
        return null;
      }
      return extractJSON(r.text);
    },

    /** Free text, or null. Text only: callers skip image requests. */
    async text(opts: { system: string; prompt: string }): Promise<string | null> {
      const r = await chat({
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });
      if (!r.text) {
        console.error(`[${cfg.id}] request failed (${r.status}): ${r.error ?? "empty reply"}`);
        return null;
      }
      return stripThinking(r.text) || null;
    },

    /** Cheapest possible call, for the status page: null when the provider answers. */
    async probe(): Promise<CompatIssue | null> {
      const r = await chat({ messages: [{ role: "user", content: "ping" }], max_tokens: 8 }, 20000);
      // a 400/422 means the key and quota are fine but the tiny request was not; only auth, billing, rate and network count
      if (r.status === 200 || r.status === 400 || r.status === 422) return null;
      return issues[cfg.id] ?? { kind: "other", status: r.status, at: new Date().toISOString(), message: `${cfg.label} did not answer (HTTP ${r.status}).` };
    },
  };
}

export type CompatProvider = ReturnType<typeof makeCompatProvider>;
