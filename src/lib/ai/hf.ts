// DeepSeek through Hugging Face Inference Providers (OpenAI-compatible router).
// Needs HF_TOKEN: a Hugging Face fine-grained token with "Make calls to Inference Providers" (paid credits).
import { makeCompatProvider } from "./compat";

export const HF_MODEL = process.env.HF_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash";

export const hf = makeCompatProvider({
  id: "hf",
  label: "DeepSeek (Hugging Face)",
  url: "https://router.huggingface.co/v1/chat/completions",
  key: () => process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "",
  model: HF_MODEL,
  billingUrl: "huggingface.co/settings/billing",
  keyName: "HF_TOKEN",
});
