export type ModelRef = {
  providerID: string
  modelID: string
}

type AgentInput = {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
  model?: ModelRef
  variant?: string
}

type AgentConfigInput = {
  model?: string
  variant?: string
}

type ProviderInput = {
  id: string
  models: Record<string, { capabilities?: { toolcall?: boolean } }>
}

export type AgentNode = {
  name: string
  description?: string
  model?: ModelRef
  variant?: string
  inherits: boolean
  status: "ready" | "unavailable"
}

export type AgentsDiagram = {
  main: AgentNode
  subagents: AgentNode[]
  mainCanStartSubagents: boolean
}

export type AgentLink = {
  x: number
  d: string
}

export const MAIN_AGENT = "main"
export const LINK_HEIGHT = 100

export function parseModelRef(value: string | undefined): ModelRef | undefined {
  if (!value) return undefined
  const index = value.indexOf("/")
  if (index <= 0 || index === value.length - 1) return undefined
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}

export function formatModelRef(model: ModelRef) {
  return `${model.providerID}/${model.modelID}`
}

export function linkPaths(count: number): AgentLink[] {
  return Array.from({ length: count }, (_, index) => {
    const x = Math.round(((index + 0.5) / count) * 10000) / 100
    const mid = LINK_HEIGHT / 2
    return { x, d: `M50 0 C50 ${mid} ${x} ${mid} ${x} ${LINK_HEIGHT}` }
  })
}

function resolve(agent: AgentInput | undefined, config: AgentConfigInput | undefined) {
  return {
    model: agent?.model ?? parseModelRef(config?.model),
    variant: agent?.variant ?? config?.variant,
  }
}

export function buildAgentsDiagram(input: {
  agents: AgentInput[]
  config?: Record<string, AgentConfigInput | undefined>
  providers: ProviderInput[]
  defaultModel?: ModelRef | null
}): AgentsDiagram {
  const visible = input.agents.filter((agent) => !agent.hidden)
  const mainAgent =
    visible.find((agent) => agent.name === MAIN_AGENT) ?? visible.find((agent) => agent.mode === "primary")
  const connected = new Set(input.providers.map((provider) => provider.id))
  const status = (model: ModelRef | undefined) => (model && connected.has(model.providerID) ? "ready" : "unavailable")

  const mainName = mainAgent?.name ?? MAIN_AGENT
  const mainResolved = resolve(mainAgent, input.config?.[mainName])
  const mainModel = mainResolved.model ?? input.defaultModel ?? undefined
  const main: AgentNode = {
    name: mainName,
    description: mainAgent?.description,
    model: mainModel,
    variant: mainResolved.variant,
    inherits: false,
    status: status(mainModel),
  }

  const subagents = visible
    .filter((agent) => agent.mode !== "primary" && agent.name !== mainName)
    .map<AgentNode>((agent) => {
      const resolved = resolve(agent, input.config?.[agent.name])
      return {
        name: agent.name,
        description: agent.description,
        model: resolved.model,
        variant: resolved.variant,
        inherits: !resolved.model,
        status: status(resolved.model ?? mainModel),
      }
    })

  const mainProvider = mainModel ? input.providers.find((provider) => provider.id === mainModel.providerID) : undefined
  const toolcall = mainModel ? mainProvider?.models[mainModel.modelID]?.capabilities?.toolcall : undefined

  return { main, subagents, mainCanStartSubagents: toolcall !== false }
}
