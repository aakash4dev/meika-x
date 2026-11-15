// Groq (free tier, no credit card): OpenAI-compatible API, used after Claude and DeepSeek on Hugging Face.
// Needs GROQ_API_KEY from console.groq.com > API Keys.
import { makeCompatProvider } from "./compat";

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export const groq = makeCompatProvider({
  id: "groq",
  label: "Groq",
  url: "https://api.groq.com/openai/v1/chat/completions",
  key: () => process.env.GROQ_API_KEY || "",
  model: GROQ_MODEL,
  billingUrl: "console.groq.com/settings/billing",
  keyName: "GROQ_API_KEY",
});
