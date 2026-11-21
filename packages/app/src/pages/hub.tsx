import { createMemo, createSignal, For, Show } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { ConnectPanel } from "@/components/void/connect-panel"
import { ConnectorTileView } from "@/components/void/connector-tile"
import {
  buildTiles,
  connectorFilters,
  filterCounts,
  filterTiles,
  hubServer,
  hubSummary,
  type ConnectorFilter,
  type ConnectorTile,
} from "@/components/void/connector-model"
import "@/components/void/hub.css"
import "@/components/void/connect-panel.css"
import { useLanguage } from "@/context/language"
import { useMcpToggle } from "@/context/mcp"
import { useSync } from "@/context/sync"

function HubBody(props: { query: string }) {
  const language = useLanguage()
  const sync = useSync()
  const toggle = useMcpToggle()
  const [filter, setFilter] = createSignal<ConnectorFilter>("all")
  const [selected, setSelected] = createSignal<string | undefined>()

  const tiles = createMemo(() => buildTiles(sync().data.mcp))
  const counts = createMemo(() => filterCounts(tiles()))
  const summary = createMemo(() => hubSummary(tiles()))
  const hub = createMemo(() => hubServer(sync().data.mcp))
  const visible = createMemo(() => filterTiles(tiles(), filter(), props.query))

  const current = createMemo(() => tiles().find((tile) => tile.id === selected()))
  const toggleTile = (tile: ConnectorTile) => {
    if (!tile.serverName || toggle.isPending) return
    toggle.mutate(tile.serverName)
  }

  return (
    <div data-slot="void-hub-body" data-panel={current() ? "open" : undefined}>
      <div data-slot="void-hub-main">
        <div data-slot="void-hub-bar">
          <span data-slot="void-hub-summary">
            <StatusDotV2 tone={hub()?.tone ?? summary().tone} />
            <Show when={hub()}>
              {(item) => (
                <>
                  <span data-slot="void-hub-hub">{language.t(`hub.hubStatus.${item().state}`)}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
            </Show>
            {language.plural("hub.summary", summary().total)}
          </span>
          <SegmentedControlV2
            aria-label={language.t("hub.filter.label")}
            value={filter()}
            onChange={(next) => setFilter((next as ConnectorFilter | null) ?? "all")}
          >
            <For each={connectorFilters}>
              {(item) => (
                <SegmentedControlItemV2 value={item}>
                  {language.t(`hub.filter.${item}`)} {counts()[item]}
                </SegmentedControlItemV2>
              )}
            </For>
          </SegmentedControlV2>
        </div>
        <Show when={visible().length > 0} fallback={<div data-slot="void-hub-empty">{language.t("hub.empty")}</div>}>
          <div data-slot="void-hub-grid">
            <For each={visible()}>
              {(tile) => (
                <ConnectorTileView
                  tile={tile}
                  selected={selected() === tile.id}
                  busy={toggle.isPending && toggle.variables === tile.serverName}
                  onSelect={() => setSelected(tile.id)}
                  onAction={() => setSelected(tile.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show when={selected()} keyed>
        {(_id) => (
          <Show when={current()}>
            {(tile) => (
              <ConnectPanel
                tile={tile()}
                busy={toggle.isPending && toggle.variables === tile().serverName}
                onToggle={() => toggleTile(tile())}
                onClose={() => setSelected(undefined)}
              />
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}

export default function HubPage(props: { empty?: boolean }) {
  const language = useLanguage()
  const [query, setQuery] = createSignal("")

  return (
    <div data-component="void-hub">
      <header data-slot="void-hub-head">
        <div data-slot="void-hub-heading">
          <h1 data-slot="void-hub-title">{language.t("hub.title")}</h1>
          <div data-slot="void-hub-sub">{language.t("hub.subtitle")}</div>
        </div>
        <label data-slot="void-hub-search">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.8" />
            <path d="M10.6 10.6L14 14" />
          </svg>
          <input
            type="text"
            value={query()}
            placeholder={language.t("hub.search")}
            aria-label={language.t("hub.search")}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </header>
      <Show when={!props.empty} fallback={<div data-slot="void-hub-empty">{language.t("hub.noProject")}</div>}>
        <HubBody query={query()} />
      </Show>
    </div>
  )
}
