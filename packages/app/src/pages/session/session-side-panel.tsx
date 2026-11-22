import { Show, createMemo } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { SessionContextTab } from "@/components/session"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { type Sizing } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"

export function SessionSidePanel(props: { reviewSnap: boolean; size: Sizing; stacked?: boolean }) {
  const settings = useSettings()
  const language = useLanguage()
  const { view, params } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const open = createMemo(() => isDesktop() && view().reviewPanel.opened())

  return (
    <Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>
      <aside
        id="context-panel"
        data-component="session-context-panel"
        aria-label={language.t("session.tab.context")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 flex overflow-hidden"
        classList={{
          "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
          "bg-background-base": !settings.general.newLayoutDesigns(),
          "h-full shrink-0": !props.stacked,
          "h-full min-h-0": props.stacked,
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
          "rounded-[10px] shadow-[var(--v2-elevation-raised)] overflow-hidden": settings.general.newLayoutDesigns(),
          "flex-1": open(),
        }}
        style={{ width: open() ? "auto" : "0px" }}
      >
        <Show when={open()}>
          <div
            class="size-full flex"
            classList={{
              "border-l border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <div
              class="relative min-w-0 h-full flex-1 overflow-hidden"
              classList={{
                "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                "bg-background-base": !settings.general.newLayoutDesigns(),
              }}
            >
              <div data-component="session-context-view" class="flex flex-col h-full overflow-hidden contain-strict">
                <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                  <SessionContextTab />
                </div>
              </div>
            </div>
          </div>
        </Show>
      </aside>
    </Show>
  )
}
