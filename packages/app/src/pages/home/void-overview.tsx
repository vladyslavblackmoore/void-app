import { createMemo, createSignal, For, Show } from "solid-js"
import { CardV2 } from "@opencode-ai/ui/v2/card-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { needsYouCards, type NeedsYouCard } from "@/components/void/needs-you-model"
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
      const pending = sessionPermissionRequest(
        store.session,
        sync.session.data.permission,
        record.session.id,
        (request) => !state.autoResponds(request, directory),
      )
      const waiting =
        !!pending || !!sessionQuestionRequest(store.session, sync.session.data.question, record.session.id)
      return {
        id: record.session.id,
        record,
        pending,
        waiting,
        working: sync.session.data.session_working(record.session.id),
      }
    })
  })
  const cards = createMemo(() =>
    needsYouCards(
      items().map((item) => ({
        sessionID: item.id,
        title: sessionTitle(item.record.session.title) || language.t("command.session.new"),
        projectName: item.record.projectName,
        directory: item.record.session.directory,
        permission: item.pending,
      })),
    ),
  )
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
                      onAllow={() =>
                        permission.ensureServerState(props.sessions.session.server()).respond({
                          sessionID: card.sessionID,
                          permissionID: card.id,
                          response: "once",
                          directory: card.directory,
                        })
                      }
                      onOpen={() => {
                        const record = props.sessions.data.records().find((item) => item.session.id === card.sessionID)
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
      </div>
    </div>
  )
}

function NeedsYou(props: { card: NeedsYouCard; onAllow: () => void; onOpen: () => void }) {
  const language = useLanguage()
  return (
    <CardV2 surface="inner" data-slot="void-overview-needs-item">
      <div data-slot="void-overview-needs-kind">
        {language.t("void.overview.needs.permission", { project: props.card.projectName })}
      </div>
      <div data-slot="void-overview-needs-title">{props.card.title}</div>
      <Show when={props.card.detail}>
        <div data-slot="void-overview-needs-detail">{props.card.detail}</div>
      </Show>
      <div data-slot="void-overview-needs-actions">
        <ButtonV2 variant="contrast" size="normal" onClick={props.onAllow}>
          {language.t("void.overview.needs.allow")}
        </ButtonV2>
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
