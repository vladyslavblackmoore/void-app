import { Show, createEffect, createMemo, createSignal } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { SessionContextTab } from "@/components/session"
import { SessionAgentsTab } from "@/components/session/session-agents-tab"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { type Sizing } from "@/pages/session/helpers"
import { agentsPanelRequest, takeAgentsPanelRequest } from "@/pages/session/agents-panel-request"
import { useSessionLayout } from "@/pages/session/session-layout"

export function SessionSidePanel(props: { reviewSnap: boolean; size: Sizing; stacked?: boolean; overlay?: boolean }) {
  const settings = useSettings()
  const language = useLanguage()
  const { view, params } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const [tab, setTab] = createSignal("context")
  const available = createMemo(() => (props.overlay ? !isDesktop() : isDesktop()))
  const open = createMemo(() => available() && view().reviewPanel.opened())
  createEffect(() => {
    if (params.id && agentsPanelRequest() === params.id && takeAgentsPanelRequest(params.id)) setTab("agents")
  })

  return (
    <Show when={available() && !(settings.general.newLayoutDesigns() && !params.id)}>
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
          "h-full shrink-0": !props.stacked && !props.overlay,
          "h-full min-h-0": props.stacked && !props.overlay,
          "fixed inset-y-0 right-0 z-50 h-full w-[min(100vw,420px)] shadow-[var(--v2-elevation-raised)]":
            !!props.overlay,
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
          "rounded-[10px] shadow-[var(--v2-elevation-raised)] overflow-hidden": settings.general.newLayoutDesigns(),
          "flex-1": open(),
        }}
        style={props.overlay ? undefined : { width: open() ? "auto" : "0px" }}
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
              <Tabs value={tab()} onChange={setTab}>
                <div class="sticky top-0 shrink-0 flex">
                  <Tabs.List>
                    <Tabs.Trigger value="context" data-tab="context">
                      {language.t("session.tab.context")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="agents" data-tab="agents">
                      {language.t("session.tab.agents")}
                    </Tabs.Trigger>
                  </Tabs.List>
                  <Show when={props.overlay}>
                    <div class="ml-auto flex items-center pr-2">
                      <IconButtonV2
                        type="button"
                        variant="ghost-muted"
                        size="large"
                        icon={<IconV2 name="xmark-small" />}
                        data-action="close-side-panel"
                        aria-label={language.t("common.close")}
                        onClick={() => view().reviewPanel.close()}
                      />
                    </div>
                  </Show>
                </div>
                <Show when={tab() === "context"}>
                  <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                    <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                      <SessionContextTab />
                    </div>
                  </Tabs.Content>
                </Show>
                <Show when={tab() === "agents"}>
                  <Tabs.Content value="agents" class="flex flex-col h-full overflow-hidden contain-strict">
                    <div class="relative flex-1 min-h-0 overflow-hidden">
                      <SessionAgentsTab />
                    </div>
                  </Tabs.Content>
                </Show>
              </Tabs>
            </div>
          </div>
        </Show>
      </aside>
    </Show>
  )
}
