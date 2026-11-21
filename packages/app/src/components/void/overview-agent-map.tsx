import { createMemo, For, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { CardV2 } from "@opencode-ai/ui/v2/card-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { loadSpaceAgentsQuery } from "@/context/global-sync/bootstrap"
import { useProviders } from "@/hooks/use-providers"
import { buildAgentsDiagram, LINK_HEIGHT, linkPaths, type AgentNode } from "@/components/agents/agents-diagram-model"
import { modelChipLabel } from "@/components/agents/model-tag"
import { overviewTagKind } from "@/components/void/overview-extras-model"
import "./overview-agent-map.css"

export function createOverviewAgents() {
  const serverSDK = useServerSDK()
  const globalConfig = useQuery(() => ({
    queryKey: [serverSDK().scope, "agents-global-config"],
    queryFn: async () => {
      if ((await serverSDK().protocol) !== "v1") return { agent: {}, provider: {}, model: undefined }
      const result = await serverSDK().client.global.config.get()
      return structuredClone({
        agent: result.data?.agent ?? {},
        provider: result.data?.provider ?? {},
        model: result.data?.model,
      })
    },
    staleTime: 0,
  }))
  const spaceAgents = useQuery(() => loadSpaceAgentsQuery(serverSDK().scope, serverSDK().client, serverSDK().protocol))
  const providers = useProviders(() => undefined)
  return createMemo(() => {
    const config = globalConfig.data
    return buildAgentsDiagram({
      agents: spaceAgents.data ?? [],
      config: config?.agent,
      providers: [
        ...providers.connected(),
        ...Object.keys(config?.provider ?? {})
          .filter((id) => !providers.connected().some((provider) => provider.id === id))
          .map((id) => ({ id, models: {} })),
      ],
      defaultModel: providers.defaultModel(),
      configModel: config?.model,
    })
  })
}

export type OverviewAgents = ReturnType<typeof createOverviewAgents>

function AgentCard(props: { node: AgentNode }) {
  const language = useLanguage()
  const model = () => {
    if (props.node.model) return modelChipLabel(props.node.model)
    return props.node.inherits ? language.t("agents.model.inherits") : language.t("agents.model.default")
  }
  return (
    <div data-slot="void-agent-node" data-main={props.node.isMain ? "true" : undefined}>
      <Show when={props.node.model}>
        <span data-slot="void-agent-tag" data-kind={overviewTagKind(props.node.model)}>
          {modelChipLabel(props.node.model)}
        </span>
      </Show>
      <div data-slot="void-agent-name">
        <span data-slot="void-agent-dot" data-status={props.node.status} />
        {props.node.name}
      </div>
      <div data-slot="void-agent-model">
        {model()}
        <Show when={props.node.variant}>{` · ${props.node.variant}`}</Show>
      </div>
    </div>
  )
}

export function OverviewAgentMap(props: { agents: OverviewAgents }) {
  const language = useLanguage()
  const diagram = () => props.agents()
  const links = createMemo(() => linkPaths(diagram().subagents.length))
  return (
    <section data-component="void-agent-map" aria-label={language.t("void.overview.agents.title")}>
      <div data-slot="void-agent-legend">
        <span>
          <i data-status="ready" />
          {language.t("agents.legend.ready")}
        </span>
        <span>
          <i data-status="unavailable" />
          {language.t("agents.legend.unavailable")}
        </span>
      </div>
      <AgentCard node={diagram().main} />
      <Show
        when={diagram().subagents.length > 0}
        fallback={<p data-slot="void-agent-empty">{language.t("void.overview.agents.empty")}</p>}
      >
        <svg
          data-slot="void-agent-links"
          viewBox={`0 0 100 ${LINK_HEIGHT}`}
          preserveAspectRatio="none"
          height={LINK_HEIGHT}
          aria-hidden="true"
        >
          <For each={links()}>{(link) => <path d={link.d} />}</For>
        </svg>
        <div
          data-slot="void-agent-row"
          style={{ "grid-template-columns": `repeat(${diagram().subagents.length}, minmax(0, 1fr))` }}
        >
          <For each={diagram().subagents}>{(node) => <AgentCard node={node} />}</For>
        </div>
      </Show>
    </section>
  )
}
