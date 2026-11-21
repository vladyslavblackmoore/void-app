import { For, Show } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import type { ConnectorKind, ConnectorTile } from "./connector-model"

const iconNames = { memory: "brain", google: "cloud-upload", generic: "mcp" } as const

export function ConnectorIcon(props: { kind: ConnectorKind }) {
  return (
    <div data-slot="void-connector-icon">
      <Icon name={iconNames[props.kind]} size="normal" />
    </div>
  )
}

export function ConnectorTileView(props: {
  tile: ConnectorTile
  selected: boolean
  busy: boolean
  tools: number | undefined
  onSelect: () => void
  onAction: () => void
}) {
  const language = useLanguage()

  return (
    <div
      data-component="void-connector-tile"
      data-state={props.tile.state}
      data-selected={props.selected ? "true" : undefined}
      tabIndex={0}
      role="button"
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          props.onSelect()
        }
      }}
    >
      <div data-slot="void-connector-top">
        <ConnectorIcon kind={props.tile.kind} />
        <div data-slot="void-connector-heading">
          <div data-slot="void-connector-name">{props.tile.name}</div>
          <div data-slot="void-connector-state">
            <StatusDotV2 tone={props.tile.tone} />
            {language.t(`hub.state.${props.tile.state}`)}
          </div>
        </div>
      </div>
      <Show when={props.tile.kind === "memory"}>
        <div data-slot="void-connector-desc">{language.t("hub.desc.memory")}</div>
      </Show>
      <Show when={props.tile.services.length > 0}>
        <div data-slot="void-connector-services">
          <For each={props.tile.services}>{(service) => <span data-slot="void-connector-service">{service}</span>}</For>
        </div>
      </Show>
      <Show when={props.tile.state === "error" && props.tile.error}>
        <div data-slot="void-connector-error">{props.tile.error}</div>
      </Show>
      <div data-slot="void-connector-foot">
        <span data-slot="void-connector-hint">
          {props.tile.state === "available"
            ? language.t("hub.available.hint")
            : props.tools
              ? language.plural("hub.tools", props.tools)
              : ""}
        </span>
        <button
          type="button"
          data-slot="void-connector-action"
          disabled={props.busy}
          onClick={(event) => {
            event.stopPropagation()
            props.onAction()
          }}
        >
          {language.t(`hub.action.${props.tile.action}`)}
        </button>
      </div>
    </div>
  )
}
