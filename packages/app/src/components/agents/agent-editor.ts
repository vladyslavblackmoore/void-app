import { formatModelRef, type AgentNode, type ModelRef } from "./agents-diagram-model"

type ModelInput = {
  id: string
  name: string
  variants?: Record<string, unknown>
}

type ProviderInput = {
  id: string
  name: string
  models: Record<string, ModelInput>
}

export type ModelOption = {
  id: string
  name: string
  ref: string
  variants: string[]
}

export type ModelGroup = {
  id: string
  name: string
  models: ModelOption[]
}

export type AgentDraft = {
  inherit: boolean
  model?: ModelRef
  variant?: string
}

export type AgentConfigPatch = {
  agent: Record<string, { model: string; variant: string }>
}

export function groupModels(providers: ProviderInput[]): ModelGroup[] {
  return providers
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: Object.values(provider.models).map((model) => ({
        id: model.id,
        name: model.name,
        ref: formatModelRef({ providerID: provider.id, modelID: model.id }),
        variants: Object.keys(model.variants ?? {}),
      })),
    }))
    .filter((group) => group.models.length > 0)
}

export function variantsFor(providers: ProviderInput[], model: ModelRef | undefined) {
  if (!model) return []
  const found = providers.find((provider) => provider.id === model.providerID)?.models[model.modelID]
  return Object.keys(found?.variants ?? {})
}

export function initialDraft(node: Pick<AgentNode, "inherits" | "model" | "variant">): AgentDraft {
  return { inherit: node.inherits, model: node.model, variant: node.variant }
}

export function selectModel(draft: AgentDraft, model: ModelRef, providers: ProviderInput[]): AgentDraft {
  const keep = draft.variant && variantsFor(providers, model).includes(draft.variant)
  return { inherit: false, model, variant: keep ? draft.variant : undefined }
}

export function buildAgentPatch(name: string, draft: AgentDraft): AgentConfigPatch {
  if (draft.inherit || !draft.model) return { agent: { [name]: { model: "", variant: "" } } }
  return { agent: { [name]: { model: formatModelRef(draft.model), variant: draft.variant ?? "" } } }
}

export function hasRunningSessions(statuses: Record<string, { type: string } | undefined>) {
  return Object.values(statuses).some((status) => !!status && status.type !== "idle")
}
