export const childAgentName = "worker"

export type ModelRef = { providerID: string; modelID: string }

type AgentEntry = { model?: string; variant?: string }

type DefaultsConfig = { default_agent?: string; agent?: Record<string, AgentEntry | undefined> }

export function mainAgentName(config: DefaultsConfig | undefined) {
  const name = config?.default_agent?.trim()
  return name ? name : "build"
}

export function parseModelRef(value: string | undefined): ModelRef | undefined {
  const text = value?.trim()
  if (!text) return undefined
  const cut = text.indexOf("/")
  if (cut <= 0 || cut === text.length - 1) return undefined
  return { providerID: text.slice(0, cut), modelID: text.slice(cut + 1) }
}

export function formatModelRef(model: ModelRef) {
  return `${model.providerID}/${model.modelID}`
}

export function agentDefault(config: DefaultsConfig | undefined, name: string) {
  const entry = config?.agent?.[name]
  const model = parseModelRef(entry?.model)
  if (!model) return undefined
  return { model, variant: entry?.variant?.trim() || undefined }
}

export function agentDefaultPatch(name: string, model: ModelRef, variant: string | undefined, subagent: boolean) {
  return {
    agent: {
      [name]: {
        model: formatModelRef(model),
        variant: variant ?? "",
        ...(subagent ? { mode: "subagent" as const } : {}),
      },
    },
  }
}

export function variantNames(variants: Record<string, unknown> | undefined) {
  return Object.keys(variants ?? {})
}

export function anyRunning(statuses: Record<string, { type: string } | undefined>) {
  return Object.values(statuses).some((status) => status !== undefined && status.type !== "idle")
}
