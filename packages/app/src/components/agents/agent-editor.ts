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

export type ConfigProviders = Record<
  string,
  { name?: string; models?: Record<string, { name?: string; variants?: Record<string, unknown> } | undefined> } | undefined
>

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
  agent: Record<string, { model?: string; variant?: string }>
}

export type FileFields = {
  model: boolean
  variant: boolean
}

export const NO_FILE_FIELDS: FileFields = { model: false, variant: false }

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

const UPSTREAM_GROUP = /^opencode/i

export function hideUpstreamGroups(groups: ModelGroup[], selected: ModelRef | undefined): ModelGroup[] {
  return groups.flatMap((group) => {
    if (!UPSTREAM_GROUP.test(group.id)) return [group]
    if (selected?.providerID !== group.id) return []
    return [{ ...group, name: "Built-in" }]
  })
}

export function withConfigProviders(providers: ProviderInput[], configured: ConfigProviders | undefined) {
  const listed = new Set(providers.map((provider) => provider.id))
  const extra = Object.entries(configured ?? {}).flatMap(([id, provider]): ProviderInput[] =>
    !provider || listed.has(id)
      ? []
      : [
          {
            id,
            name: provider.name ?? id,
            models: Object.fromEntries(
              Object.entries(provider.models ?? {}).map(([modelID, model]) => [
                modelID,
                { id: modelID, name: model?.name ?? modelID, variants: model?.variants },
              ]),
            ),
          },
        ],
  )
  return [...providers, ...extra]
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

export function fileFields(
  agent: { model?: ModelRef; variant?: string } | undefined,
  config: { model?: string; variant?: string } | undefined,
): FileFields {
  return {
    model: !!agent?.model && formatModelRef(agent.model) !== config?.model,
    variant: !!agent?.variant && agent.variant !== config?.variant,
  }
}

export function canSave(locked: FileFields) {
  return !(locked.model && locked.variant)
}

export function buildAgentPatch(
  name: string,
  draft: AgentDraft,
  locked: FileFields = NO_FILE_FIELDS,
): AgentConfigPatch {
  const clear = draft.inherit || !draft.model
  const values = {
    model: clear ? "" : formatModelRef(draft.model!),
    variant: clear ? "" : (draft.variant ?? ""),
  }
  return {
    agent: {
      [name]: {
        ...(locked.model ? {} : { model: values.model }),
        ...(locked.variant ? {} : { variant: values.variant }),
      },
    },
  }
}

export function hasRunningSessions(statuses: Record<string, { type: string } | undefined>) {
  return Object.values(statuses).some((status) => !!status && status.type !== "idle")
}

export function effortControl(themeId: string | undefined): "segmented" | "chips" {
  return themeId === "void" ? "segmented" : "chips"
}
