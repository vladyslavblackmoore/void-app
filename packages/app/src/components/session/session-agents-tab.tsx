import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js"
import { Message } from "@opencode-ai/session-ui/message-part"
import { IconButton } from "@opencode-ai/ui/icon-button"
import type { Message as MessageType, Part, Session } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import {
  AGENT_TREE_MAX_DEPTH,
  agentRowTitle,
  agentRunState,
  buildAgentTree,
  withoutRemoved,
  withoutWorkerNote,
  type AgentRunState,
} from "@/pages/session/agents-tree"
import { sessionTitle } from "@/utils/session-title"

const emptyMessages: MessageType[] = []
const emptyParts: Part[] = []

const stateColor: Record<AgentRunState, string> = {
  running: "var(--syntax-info)",
  idle: "var(--syntax-success)",
  error: "var(--syntax-critical)",
  aborted: "var(--syntax-warning)",
}

function modelLabel(messages: MessageType[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === "assistant") return `${message.providerID}/${message.modelID}`
  }
  const user = messages.find((message) => message.role === "user")
  if (user?.role === "user") return `${user.model.providerID}/${user.model.modelID}`
  return ""
}

export function SessionAgentsTab() {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const { params } = useSessionLayout()
  const [selected, setSelected] = createSignal<string>()
  const [removed, setRemoved] = createSignal<ReadonlySet<string>>(new Set<string>())

  const rootID = () => params.id

  const loadChildren = async (sessionID: string, depth: number): Promise<Session[]> => {
    const result = await sdk().client.session.children({ sessionID })
    const direct = result.data ?? []
    if (depth >= AGENT_TREE_MAX_DEPTH) return direct
    const nested = await Promise.all(direct.map((child) => loadChildren(child.id, depth + 1)))
    return [...direct, ...nested.flat()]
  }

  const [fetched] = createResource(rootID, async (id) => {
    try {
      return await loadChildren(id, 1)
    } catch {
      return [] as Session[]
    }
  })

  const markRemoved = (id: string) => setRemoved((current) => new Set<string>(current).add(id))
  const offDeleted = sdk().event.on("session.deleted", (event) => {
    const properties = event.properties as { sessionID?: string; info?: Session }
    const id = properties.info?.id ?? properties.sessionID
    if (id) markRemoved(id)
  })
  const offUpdated = sdk().event.on("session.updated", (event) => {
    const info = (event.properties as { info: Session }).info
    if (info.time.archived) markRemoved(info.id)
  })
  onCleanup(() => {
    offDeleted()
    offUpdated()
  })

  createEffect(
    on(rootID, () => {
      setSelected(undefined)
      setRemoved(new Set<string>())
    }),
  )

  const sessions = createMemo(() => {
    const merged = new Map<string, Session>()
    for (const item of fetched() ?? []) merged.set(item.id, item)
    for (const item of sync().data.session) merged.set(item.id, item)
    return withoutRemoved([...merged.values()], removed())
  })

  const rows = createMemo(() => {
    const id = rootID()
    if (!id) return []
    return buildAgentTree(sessions(), id)
  })

  const rowIds = createMemo(() => rows().map((row) => row.session.id))
  const rowById = createMemo(() => new Map(rows().map((row) => [row.session.id, row])))

  const messagesOf = (id: string) => (sync().data.message[id] ?? emptyMessages) as MessageType[]
  const titleOf = (item: Session) => agentRowTitle(sessionTitle(item.title)) || item.id
  const stateOf = (id: string) => {
    const last = messagesOf(id).findLast((message) => message.role === "assistant")
    const failed = last?.role === "assistant" && !!last.error
    const aborted = failed && last?.role === "assistant" && last.error?.name === "MessageAbortedError"
    return agentRunState(sync().data.session_status[id], failed, aborted)
  }

  const abort = (id: string) => void sdk().client.session.abort({ sessionID: id }).catch(() => undefined)

  return (
    <div data-component="agents-tab" class="flex flex-col h-full min-h-0 overflow-hidden">
      <Show
        when={selected()}
        fallback={
          <div data-component="agents-list" class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
            <Show
              when={rows().length > 0}
              fallback={<div class="px-3 py-4 text-12-regular text-text-weak">{language.t("session.agents.empty")}</div>}
            >
              <For each={rowIds()}>
                {(id) => (
                  <Show when={rowById().get(id)}>
                    {(row) => (
                      <AgentRow
                        session={row().session}
                        depth={row().depth}
                        title={titleOf(row().session)}
                        state={stateOf(id)}
                        model={modelLabel(messagesOf(id))}
                        onOpen={() => setSelected(id)}
                        onAbort={() => abort(id)}
                      />
                    )}
                  </Show>
                )}
              </For>
            </Show>
          </div>
        }
      >
        {(id) => (
          <AgentChat
            sessionID={id()}
            title={titleOf(sessions().find((item) => item.id === id()) ?? ({ id: id(), title: "" } as Session))}
            onBack={() => setSelected(undefined)}
          />
        )}
      </Show>
    </div>
  )
}

function AgentRow(props: {
  session: Session
  depth: number
  title: string
  state: AgentRunState
  model: string
  onOpen: () => void
  onAbort: () => void
}) {
  const sync = useSync()
  const language = useLanguage()

  createEffect(on(() => props.session.id, (id) => void sync().session.sync(id)))

  return (
    <div
      data-agent-row
      data-session-id={props.session.id}
      data-agent-status={props.state}
      data-agent-depth={props.depth}
      class="flex items-center gap-1 rounded-md hover:bg-surface-raised-base-hover"
      style={{ "padding-left": `${(props.depth - 1) * 16}px` }}
    >
      <button
        type="button"
        data-agent-open
        class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left"
        onClick={props.onOpen}
      >
        <span
          data-agent-dot
          class="size-2 shrink-0 rounded-full"
          classList={{ "animate-pulse": props.state === "running" }}
          style={{ "background-color": stateColor[props.state] }}
          title={language.t(`session.agents.status.${props.state}`)}
        />
        <span class="min-w-0 flex-1 flex flex-col">
          <span class="truncate text-13-medium text-text-strong">{props.title}</span>
          <span class="truncate text-12-regular text-text-weak">
            {language.t(`session.agents.status.${props.state}`)}
            <Show when={props.model}>{` · ${props.model}`}</Show>
          </span>
        </span>
      </button>
      <Show when={props.state === "running"}>
        <IconButton
          icon="circle-x"
          variant="ghost"
          class="h-6 w-6 shrink-0 mr-1"
          data-agent-abort
          aria-label={language.t("session.agents.abort")}
          onClick={props.onAbort}
        />
      </Show>
    </div>
  )
}

function AgentChat(props: { sessionID: string; title: string; onBack: () => void }) {
  const sync = useSync()
  const language = useLanguage()

  createEffect(on(() => props.sessionID, (id) => void sync().session.sync(id)))

  const messages = createMemo(() => (sync().data.message[props.sessionID] ?? emptyMessages) as MessageType[])

  return (
    <div data-component="agent-chat" data-session-id={props.sessionID} class="flex flex-col h-full min-h-0">
      <div class="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border-weak-base">
        <IconButton
          icon="arrow-left"
          variant="ghost"
          class="h-6 w-6 shrink-0"
          data-agent-back
          aria-label={language.t("session.agents.back")}
          onClick={props.onBack}
        />
        <div class="min-w-0 truncate text-13-medium text-text-strong">{props.title}</div>
      </div>
      <div data-agent-messages class="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-3">
        <Show
          when={messages().length > 0}
          fallback={<div class="text-12-regular text-text-weak">{language.t("session.agents.noMessages")}</div>}
        >
          <For each={messages()}>
            {(message) => (
              <div data-slot="session-turn-message-content" data-message-id={message.id}>
                <Message message={message} parts={withoutWorkerNote(sync().data.part[message.id] ?? emptyParts)} />
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
