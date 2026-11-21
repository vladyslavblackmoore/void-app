import { createResource, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { visibleCoreState } from "@/spaces/model"
import { spaceCardModel } from "@/components/void/space-chip-model"

export function VoidSpaceCard() {
  const platform = usePlatform()
  const server = useServer()
  const language = useLanguage()
  const viewed = () => ServerConnection.space(server.current)
  const [known] = createResource(
    () => (platform.spaces ? viewed() : undefined),
    () => platform.spaces!.list().catch(() => []),
  )
  const [status, setStatus] = createSignal<{ space: string; state: "restarting" | "up" | "failed" }>()
  const off = platform.spaces?.onCoreStatus?.((next) => setStatus({ space: next.space, state: next.state }))
  onCleanup(() => off?.())
  const card = () => spaceCardModel(known.latest ?? [], viewed(), visibleCoreState(status(), viewed()))

  return (
    <Show when={card()}>
      {(value) => (
        <div data-slot="void-space-card" data-core={value().core} style={{ "--space": value().color }}>
          <span data-slot="void-space-card-label">{language.t("void.space.label")}</span>
          <div data-slot="void-space-card-row">
            <span data-slot="void-space-card-dot" aria-hidden="true" />
            <span data-slot="void-space-card-name">{value().name}</span>
            <span data-slot="void-space-card-core">{language.t(`void.space.status.${value().core}`)}</span>
          </div>
        </div>
      )}
    </Show>
  )
}
