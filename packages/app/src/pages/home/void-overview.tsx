import { useQuery } from "@tanstack/solid-query"
import { createMemo, createSignal, For, Show } from "solid-js"
import { CardV2 } from "@opencode-ai/ui/v2/card-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { needsYouCards, type NeedsYouCard } from "@/components/void/needs-you-model"
import {
  filterOverview,
  overviewState,
  overviewStats,
  type OverviewFilter,
  type OverviewSession,
} from "@/components/void/overview-model"
import { createOverviewAgents, OverviewAgentMap } from "@/components/void/overview-agent-map"
import { memoryCard } from "@/components/void/overview-memory-model"
import { pathKey } from "@/utils/path-key"
import { sessionTitle } from "@/utils/session-title"
import type { HomeController } from "./home-controller"
import type { HomeSessionRecord, HomeSessionsController } from "./home-sessions-controller"
import { createVoidSessionItems } from "./void-session-items"
import "./void-overview.css"

const filters: OverviewFilter[] = ["all", "running", "done"]

export function VoidOverview(props: { home: HomeController; sessions: HomeSessionsController }) {
  const language = useLanguage()
  const [filter, setFilter] = createSignal<OverviewFilter>("all")

  const items = createVoidSessionItems(props.home, props.sessions)
  const [responding, setResponding] = createSignal<string>()
  const allow = (card: NeedsYouCard) => {
    const ctx = props.home.server.focusedContext()
    if (!ctx || responding() === card.id) return
    setResponding(card.id)
    ctx.sdk.api.permission
      .reply({
        sessionID: card.sessionID,
        requestID: card.id,
        reply: "once",
        location: { directory: card.directory },
      })
      .catch((err: unknown) => {
        const description = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description })
      })
      .finally(() => setResponding((id) => (id === card.id ? undefined : id)))
  }
  const cards = createMemo(() =>
    needsYouCards(
      items().map((item) => ({
        sessionID: item.id,
        title: sessionTitle(item.record.session.title) || language.t("command.session.new"),
        projectName: item.record.projectName,
        directory: item.record.session.directory,
        permission: item.pending,
        question: item.question,
      })),
    ),
  )
  const agents = createOverviewAgents()
  const mcpDirectory = () => {
    const worktree = props.home.project.newSession()?.worktree
    return worktree ? pathKey(worktree) : undefined
  }
  const mcp = useQuery(() => {
    const directory = mcpDirectory()
    return {
      ...props.home.server.focusedSync().queryOptions.mcp(directory ?? pathKey("")),
      enabled: !!directory,
    }
  })
  const memory = createMemo(() => memoryCard(mcp.data))
  const agentCount = () => 1 + agents().subagents.length
  const stats = createMemo(() => overviewStats(items()))
  const visible = createMemo(() => filterOverview(items(), filter()))

  return (
    <div data-component="void-overview">
      <header data-slot="void-overview-head">
        <div>
          <h1 data-slot="void-overview-title">{language.t("void.overview.title")}</h1>
          <div data-slot="void-overview-subtitle">
            {language.t("void.overview.agents.count", { count: String(agentCount()) })}
          </div>
        </div>
        <div data-slot="void-overview-stats">
          <Stat value={stats().sessions} label={language.t("void.overview.stat.sessions")} />
          <Stat value={stats().running} label={language.t("void.overview.stat.running")} />
          <Stat
            value={stats().needsYou}
            label={language.t("void.overview.stat.needsYou")}
            warn={stats().needsYou > 0}
          />
        </div>
      </header>
      <div data-slot="void-overview-main">
        <Show when={items().length === 0 && !props.sessions.data.loading()}>
          <EmptyCard canCreate={props.sessions.session.canCreate()} onCreate={props.sessions.session.create} />
        </Show>
        <Show when={items().length > 0}>
          <aside data-slot="void-overview-column" aria-label={language.t("void.overview.board.title")}>
            <Show when={cards().length > 0}>
              <CardV2 data-slot="void-overview-needs">
                <div data-slot="void-overview-card-head">
                  <StatusDotV2 tone="yellow" />
                  <span data-slot="void-overview-card-title">{language.t("void.overview.needs.title")}</span>
                </div>
                <For each={cards()}>
                  {(card) => (
                    <NeedsYou
                      card={card}
                      responding={responding() === card.id}
                      onAllow={() => allow(card)}
                      onOpen={() => {
                        const record = props.sessions.data.records().find((item) => item.session.id === card.rootID)
                        if (record) props.sessions.session.open(record.session)
                      }}
                    />
                  )}
                </For>
              </CardV2>
            </Show>
            <CardV2 data-slot="void-overview-board">
              <div data-slot="void-overview-card-head">
                <span data-slot="void-overview-card-title">{language.t("void.overview.board.title")}</span>
                <div data-slot="void-overview-filter" role="radiogroup" aria-label={language.t("void.overview.filter")}>
                  <For each={filters}>
                    {(id) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={filter() === id}
                        data-active={filter() === id ? "true" : undefined}
                        onClick={() => setFilter(id)}
                      >
                        {language.t(`void.overview.filter.${id}`)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div data-slot="void-overview-list">
                <For each={visible()}>
                  {(item) => <TaskRow item={item} onOpen={() => props.sessions.session.open(item.record.session)} />}
                </For>
                <Show when={visible().length === 0}>
                  <div data-slot="void-overview-empty">{language.t("void.overview.board.empty")}</div>
                </Show>
              </div>
            </CardV2>
          </aside>
        </Show>
        <OverviewAgentMap agents={agents} />
        <Show when={memory()}>
          {(card) => (
            <aside data-slot="void-overview-side">
              <CardV2 data-slot="void-overview-memory">
                <div data-slot="void-overview-card-head">
                  <span data-slot="void-overview-card-title">{language.t("void.overview.memory.title")}</span>
                  <span data-slot="void-overview-memory-state">
                    <StatusDotV2 tone={card().tone} />
                    {language.t(`hub.state.${card().state}`)}
                  </span>
                </div>
              </CardV2>
            </aside>
          )}
        </Show>
      </div>
    </div>
  )
}

function NeedsYou(props: { card: NeedsYouCard; responding: boolean; onAllow: () => void; onOpen: () => void }) {
  const language = useLanguage()
  return (
    <CardV2 surface="inner" data-slot="void-overview-needs-item">
      <div data-slot="void-overview-needs-kind">
        {language.t(`void.overview.needs.${props.card.kind}`, { project: props.card.projectName })}
      </div>
      <div data-slot="void-overview-needs-title">{props.card.title}</div>
      <Show when={props.card.detail}>
        <div data-slot="void-overview-needs-detail">{props.card.detail}</div>
      </Show>
      <div data-slot="void-overview-needs-actions">
        <Show when={props.card.kind === "permission"}>
          <ButtonV2 variant="contrast" size="normal" disabled={props.responding} onClick={props.onAllow}>
            {language.t("void.overview.needs.allow")}
          </ButtonV2>
        </Show>
        <ButtonV2 variant="neutral" size="normal" onClick={props.onOpen}>
          {language.t("void.overview.needs.open")}
        </ButtonV2>
      </div>
    </CardV2>
  )
}

function EmptyCard(props: { canCreate: boolean; onCreate: () => void }) {
  const language = useLanguage()
  return (
    <div data-slot="void-overview-empty-card">
      <span data-slot="void-overview-empty-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3.5h10v7H7.2L4 13v-2.5H3z" />
        </svg>
      </span>
      <div data-slot="void-overview-empty-title">{language.t("void.overview.empty.title")}</div>
      <div data-slot="void-overview-empty-text">{language.t("void.overview.empty.text")}</div>
      <ButtonV2 variant="contrast" size="normal" disabled={!props.canCreate} onClick={props.onCreate}>
        {language.t("void.overview.empty.action")}
      </ButtonV2>
    </div>
  )
}

function Stat(props: { value: number; label: string; warn?: boolean }) {
  return (
    <div data-slot="void-overview-stat">
      <div data-slot="void-overview-stat-num">
        <Show when={props.warn}>
          <StatusDotV2 tone="yellow" glow size="large" />
        </Show>
        {props.value}
      </div>
      <div data-slot="void-overview-stat-label">{props.label}</div>
    </div>
  )
}

function TaskRow(props: { item: OverviewSession & { record: HomeSessionRecord }; onOpen: () => void }) {
  const language = useLanguage()
  const state = createMemo(() => overviewState(props.item))
  return (
    <button type="button" data-slot="void-overview-task" onClick={props.onOpen}>
      <StatusDotV2 status={state()} />
      <span data-slot="void-overview-task-name">
        {sessionTitle(props.item.record.session.title) || language.t("command.session.new")}
      </span>
      <span data-slot="void-overview-task-meta">{props.item.record.projectName}</span>
      <span data-slot="void-overview-task-state">{language.t(`void.overview.state.${state()}`)}</span>
    </button>
  )
}
