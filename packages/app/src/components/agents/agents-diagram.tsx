import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { useProviders } from "@/hooks/use-providers"
import { buildAgentsDiagram, formatModelRef, LINK_HEIGHT, linkPaths, type AgentNode } from "./agents-diagram-model"
import "./agents-diagram.css"

function AgentNodeCard(props: { node: AgentNode; main?: boolean }) {
  const language = useLanguage()
  const model = () => {
    if (props.node.model) return formatModelRef(props.node.model)
    return props.node.inherits ? language.t("agents.model.inherits") : language.t("agents.model.default")
  }

  return (
    <div
      data-component="agents-node"
      data-agent={props.node.name}
      class="flex w-full max-w-[280px] flex-col gap-3 rounded-2xl p-4 text-v2-text-text-base"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span data-slot="agents-dot" data-status={props.node.status} class="size-2 shrink-0 rounded-full" />
        <span class="min-w-0 truncate text-[14px] font-semibold">{props.node.name}</span>
      </div>
      <p class="min-h-8 text-[12px] leading-4 text-v2-text-text-faint">
        {props.node.description ??
          (props.main ? language.t("agents.node.main.description") : language.t("agents.node.subagent.description"))}
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <span data-slot="agents-chip" class="max-w-full truncate rounded-md px-2 py-1 font-mono text-[11px]">
          {model()}
        </span>
        <span data-slot="agents-chip" class="rounded-md px-2 py-1 text-[11px]">
          {language.t("agents.effort")}{" "}
          <span class="font-semibold">{props.node.variant ?? language.t("agents.effort.notSet")}</span>
        </span>
      </div>
    </div>
  )
}

export function AgentsDiagram() {
  const language = useLanguage()
  const layout = useLayout()
  const serverSync = useServerSync()
  const directory = createMemo(() => layout.projects.list()[0]?.worktree)
  const providers = useProviders(directory)
  const agents = createMemo(() => {
    const value = directory()
    return value ? serverSync().child(value)[0].agent : []
  })

  const diagram = createMemo(() =>
    buildAgentsDiagram({
      agents: agents(),
      config: serverSync().data.config.agent,
      providers: providers.connected(),
      defaultModel: providers.defaultModel(),
    }),
  )
  const links = createMemo(() => linkPaths(diagram().subagents.length))

  return (
    <div data-component="agents-canvas" class="px-9 py-8">
      <h2 class="text-[28px] font-semibold text-v2-text-text-base">{language.t("agents.title")}</h2>
      <p class="mt-1 text-[13px] text-v2-text-text-faint">{language.t("agents.description")}</p>
      <div class="mx-auto mt-10 flex max-w-[1200px] flex-col items-center">
        <AgentNodeCard node={diagram().main} main />
        <Show when={!diagram().mainCanStartSubagents}>
          <span class="mt-3 rounded-md bg-v2-background-bg-layer-02 px-2 py-1 text-[12px] text-v2-text-text-base">
            {language.t("agents.note.noToolCalls")}
          </span>
        </Show>
        <Show
          when={diagram().subagents.length > 0}
          fallback={<p class="mt-10 text-[13px] text-v2-text-text-faint">{language.t("agents.empty")}</p>}
        >
          <div class="relative w-full" style={{ height: `${LINK_HEIGHT}px` }}>
            <svg
              class="absolute inset-0 size-full"
              viewBox={`0 0 100 ${LINK_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <For each={links()}>{(link) => <path data-slot="agents-link" d={link.d} />}</For>
            </svg>
          </div>
          <div
            class="grid w-full justify-items-center gap-4"
            style={{ "grid-template-columns": `repeat(${diagram().subagents.length}, minmax(0, 1fr))` }}
          >
            <For each={diagram().subagents}>{(node) => <AgentNodeCard node={node} />}</For>
          </div>
        </Show>
      </div>
    </div>
  )
}
