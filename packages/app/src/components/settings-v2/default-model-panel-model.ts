import { providerLabel } from "../void/provider-branding"

type ProviderInput = { id: string; name: string; models: Record<string, { name: string }> }

export type DefaultModelPanel =
  | { state: "unset" }
  | { state: "ready" | "unavailable"; providerName: string; modelName: string; effort: string | undefined }

export function defaultModelPanel(input: {
  model?: string
  variant?: string
  providers: ProviderInput[]
  isVoid?: boolean
}): DefaultModelPanel {
  const value = input.model
  const index = value ? value.indexOf("/") : -1
  if (!value || index <= 0 || index === value.length - 1) return { state: "unset" }
  const providerID = value.slice(0, index)
  const modelID = value.slice(index + 1)
  const provider = input.providers.find((item) => item.id === providerID)
  const effort = input.variant || undefined
  if (!provider)
    return {
      state: "unavailable",
      providerName: providerLabel(input.isVoid ?? false, providerID, providerID),
      modelName: modelID,
      effort,
    }
  return {
    state: "ready",
    providerName: providerLabel(input.isVoid ?? false, provider.id, provider.name),
    modelName: provider.models[modelID]?.name ?? modelID,
    effort,
  }
}
