import type { ModelRef } from "./agents-diagram-model"

export type ModelTagKind = "opus" | "sonnet" | "gpt5" | "local" | "other"

const LOCAL_PROVIDERS = ["ollama", "lmstudio", "llama", "local"]
const LOCAL_MODELS = ["local", "qwen", "llama", "gguf"]

export function modelTagKind(model: ModelRef | undefined): ModelTagKind {
  if (!model) return "other"
  const id = model.modelID.toLowerCase()
  const provider = model.providerID.toLowerCase()
  if (id.includes("opus")) return "opus"
  if (id.includes("sonnet")) return "sonnet"
  if (id.includes("gpt")) return "gpt5"
  if (LOCAL_PROVIDERS.some((name) => provider.includes(name))) return "local"
  if (LOCAL_MODELS.some((name) => id.includes(name))) return "local"
  return "other"
}

export function modelTagLabel(model: ModelRef | undefined) {
  return model?.modelID
}
