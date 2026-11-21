import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { DateTime } from "luxon"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { overviewState } from "@/components/void/overview-model"
import { filterSessionList, groupSessionList } from "@/components/void/session-list-model"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeSessionsController } from "@/pages/home/home-sessions-controller"
import { createVoidSessionItems } from "@/pages/home/void-session-items"
import { sessionTitle } from "@/utils/session-title"
import { VoidSessionsEmpty } from "./void-sessions-empty"
import { VoidSpaceCard } from "./void-space-card"
import "./void-session-sheets.css"

export function VoidSessionList() {
  const language = useLanguage()
  const params = useParams<{ id?: string }>()
  const home = createHomeController()
  const sessions = createHomeSessionsController(home, { commands: false, prefetch: false })
  const items = createVoidSessionItems(home, sessions)
  const [query, setQuery] = createSignal("")
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 60_000)
  onCleanup(() => clearInterval(tick))

  const rows = createMemo(() =>
    items().map((item) => ({
      ...item,
      title: sessionTitle(item.record.session.title) || language.t("command.session.new"),
      updated: item.record.session.time.updated ?? item.record.session.time.created,
    })),
  )
  const groups = createMemo(() => groupSessionList(filterSessionList(rows(), query()), now()))

  const ago = (time: number) =>
    DateTime.fromMillis(time).setLocale(language.intl()).toRelative({ style: "short" }) ?? ""

  return (
    <aside data-component="void-session-list" aria-label={language.t("void.sessions.title")}>
      <div data-slot="void-sheet-head">
        <span data-slot="void-sheet-title">{language.t("void.sessions.title")}</span>
        <button
          type="button"
          data-slot="void-sheet-add"
          aria-label={language.t("void.sessions.new")}
          disabled={!sessions.session.canCreate()}
          onClick={() => sessions.session.create()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div data-slot="void-sheet-search-wrap">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          type="search"
          data-slot="void-sheet-search"
          value={query()}
          placeholder={language.t("void.sessions.search")}
          aria-label={language.t("void.sessions.search")}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div data-slot="void-sheet-scroll">
        <For each={groups()}>
          {(group) => (
            <section>
              <div data-slot="void-sheet-eyebrow">{language.t(`void.sessions.group.${group.id}`)}</div>
              <For each={group.items}>
                {(item) => (
                  <button
                    type="button"
                    data-slot="void-session-row"
                    data-active={item.id === params.id ? "true" : undefined}
                    onClick={() => sessions.session.open(item.record.session)}
                  >
                    <StatusDotV2 status={overviewState(item)} />
                    <span data-slot="void-session-row-title">{item.title}</span>
                    <span data-slot="void-session-row-meta">
                      {item.record.projectName} · {language.t(`void.overview.state.${overviewState(item)}`)}
                      <Show when={ago(item.updated)}>{(text) => <> · {text()}</>}</Show>
                    </span>
                  </button>
                )}
              </For>
            </section>
          )}
        </For>
        <Show when={groups().length === 0}>
          <VoidSessionsEmpty
            title={language.t(query() ? "void.sessions.empty.searchTitle" : "void.sessions.empty.title")}
            text={language.t(query() ? "void.sessions.empty.searchText" : "void.sessions.empty.text")}
            action={
              query()
                ? undefined
                : {
                    label: language.t("void.sessions.new"),
                    disabled: !sessions.session.canCreate(),
                    run: () => sessions.session.create(),
                  }
            }
          />
        </Show>
      </div>
      <VoidSpaceCard />
    </aside>
  )
}
