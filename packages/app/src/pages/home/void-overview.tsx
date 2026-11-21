import { createMemo, createSignal, For, Show } from "solid-js"
import { CardV2 } from "@opencode-ai/ui/v2/card-v2"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import {
  filterOverview,
  overviewState,
  overviewStats,
  type OverviewFilter,
  type OverviewSession,
} from "@/components/void/overview-model"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import { sessionTitle } from "@/utils/session-title"
import type { HomeController } from "./home-controller"
import type { HomeSessionRecord, HomeSessionsController } from "./home-sessions-controller"
import "./void-overview.css"

const filters: OverviewFilter[] = ["all", "running", "waiting"]

export function VoidOverview(props: { home: HomeController; sessions: HomeSessionsController }) {
  const language = useLanguage()
  const permission = usePermission()
  const [filter, setFilter] = createSignal<OverviewFilter>("all")

  const items = createMemo(() => {
    const sync = props.home.server.focusedSync()
    const server = props.sessions.session.server()
    return props.sessions.data.records().map((record) => {
      const directory = record.session.directory
      const [store] = sync.child(directory)
      const state = permission.ensureServerState(server)
      const waiting =
        !!sessionPermissionRequest(
          store.session,
          sync.session.data.permission,
          record.session.id,
          (request) => !state.autoResponds(request, directory),
        ) || !!sessionQuestionRequest(store.session, sync.session.data.question, record.session.id)
      return {
        id: record.session.id,
        record,
        waiting,
        working: sync.session.data.session_working(record.session.id),
      }
    })
  })
  const stats = createMemo(() => overviewStats(items()))
  const visible = createMemo(() => filterOverview(items(), filter()))

  return (
    <div data-component="void-overview">
      <header data-slot="void-overview-head">
        <h1 data-slot="void-overview-title">{language.t("void.overview.title")}</h1>
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
        <aside data-slot="void-overview-column" aria-label={language.t("void.overview.board.title")}>
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
      </div>
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
