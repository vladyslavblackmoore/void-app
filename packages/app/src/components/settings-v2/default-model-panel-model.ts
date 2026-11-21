import { providerLabel } from "../void/provider-branding"

type ProviderInput = {
  id: string
  name: string
  models: Record<string, { name: string; variants?: Record<string, unknown> }>
}

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

export type DefaultModelOption = { ref: string; name: string; variants: string[] }
export type DefaultModelGroup = { id: string; name: string; models: DefaultModelOption[] }
export type DefaultDraft = { model?: string; variant?: string }

export function defaultModelGroups(providers: ProviderInput[], isVoid: boolean): DefaultModelGroup[] {
  return providers
    .map((provider) => ({
      id: provider.id,
      name: providerLabel(isVoid, provider.id, provider.name),
      models: Object.entries(provider.models).map(([id, model]) => ({
        ref: `${provider.id}/${id}`,
        name: model.name,
        variants: Object.keys(model.variants ?? {}),
      })),
    }))
    .filter((group) => group.models.length > 0)
}

export function effortOptions(groups: DefaultModelGroup[], model: string | undefined) {
  if (!model) return []
  for (const group of groups) {
    const found = group.models.find((option) => option.ref === model)
    if (found) return found.variants
  }
  return []
}

export const effortScale = ["low", "medium", "high", "xhigh", "max"]

export function effortControl(groups: DefaultModelGroup[], model: string | undefined) {
  const variants = effortOptions(groups, model)
  return variants.length > 0 ? { live: true, values: variants } : { live: false, values: effortScale }
}

export function selectDefaultModel(draft: DefaultDraft, ref: string, groups: DefaultModelGroup[]): DefaultDraft {
  const keep = draft.variant && effortOptions(groups, ref).includes(draft.variant)
  return { model: ref, variant: keep ? draft.variant : undefined }
}

export function toggleEffort(draft: DefaultDraft, variant: string): DefaultDraft {
  return { ...draft, variant: draft.variant === variant ? undefined : variant }
}

export function isDraftDirty(draft: DefaultDraft, saved: DefaultDraft) {
  return (
    (draft.model || undefined) !== (saved.model || undefined) ||
    (draft.variant || undefined) !== (saved.variant || undefined)
  )
}

export function defaultModelPatch(draft: DefaultDraft, mainName = "main") {
  if (!draft.model) return undefined
  return { model: draft.model, agent: { [mainName]: { variant: draft.variant ?? "" } } }
}

export function inheritedBy(nodes: { name: string; inherits: boolean; isMain: boolean }[]) {
  const names = nodes.filter((node) => node.isMain || node.inherits).map((node) => node.name)
  return { names, own: nodes.length - names.length }
}
