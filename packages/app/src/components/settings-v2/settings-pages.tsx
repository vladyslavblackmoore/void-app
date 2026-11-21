import { createMemo, createSignal, For, Show, startTransition, type Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Icon } from "@opencode-ai/ui/icon"
import { TabsV2 } from "@opencode-ai/ui/v2/tabs-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { useLanguage } from "@/context/language"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsServersV2 } from "./servers"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import { useVoidTheme } from "../void/use-void-theme"
import "./settings-v2.css"

type Section = {
  value: string
  icon: "sliders" | "keyboard" | "server" | "providers" | "models"
  title: () => string
  content: Component
}

type Page = {
  nav: "list" | "segmented"
  title: "void.models.title" | "void.settings.title"
  subtitle: "void.models.subtitle" | "void.settings.subtitle"
}

function SettingsSections(props: { sections: Section[]; page: Page }) {
  const language = useLanguage()
  const isVoid = useVoidTheme()
  const [tab, setTab] = createSignal(props.sections[0]?.value ?? "")
  const active = createMemo(() => props.sections.find((section) => section.value === tab()) ?? props.sections[0])
  const select = (value: string) => setTab(value)

  const VoidSections = () => (
    <div class="void-settings-page" data-nav={props.page.nav} data-section={tab()}>
      <header class="void-settings-head">
        <div class="void-settings-heading">
          <h1 class="void-settings-title">{language.t(props.page.title)}</h1>
          <p class="void-settings-subtitle">{language.t(props.page.subtitle)}</p>
        </div>
        <Show when={props.page.nav === "segmented"}>
          <SegmentedControlV2
            value={tab()}
            onChange={(value) => value && select(value)}
            aria-label={language.t("void.models.nav")}
          >
            <For each={props.sections}>
              {(section) => <SegmentedControlItemV2 value={section.value}>{section.title()}</SegmentedControlItemV2>}
            </For>
          </SegmentedControlV2>
        </Show>
      </header>
      <div class="void-settings-grid">
        <Show when={props.page.nav === "list"}>
          <nav class="void-settings-nav" aria-label={language.t(props.page.title)}>
            <For each={props.sections}>
              {(section) => (
                <button
                  type="button"
                  class="void-settings-nav-item"
                  data-active={tab() === section.value ? "" : undefined}
                  aria-current={tab() === section.value ? "page" : undefined}
                  onClick={() => select(section.value)}
                >
                  <Icon name={section.icon} />
                  {section.title()}
                </button>
              )}
            </For>
          </nav>
        </Show>
        <div class="settings-v2-panel void-settings-content">
          <Show when={active()} keyed>
            {(section) => <Dynamic component={section.content} />}
          </Show>
        </div>
      </div>
    </div>
  )

  return (
    <Show when={!isVoid()} fallback={<VoidSections />}>
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="settings-v2 h-full w-full"
      >
        <TabsV2.List>
          <div class="flex flex-col gap-1.5 w-full">
            <For each={props.sections}>
              {(section) => (
                <TabsV2.Trigger value={section.value}>
                  <Icon name={section.icon} />
                  {section.title()}
                </TabsV2.Trigger>
              )}
            </For>
          </div>
        </TabsV2.List>
        <For each={props.sections}>
          {(section) => (
            <TabsV2.Content value={section.value} class="settings-v2-panel">
              <section.content />
            </TabsV2.Content>
          )}
        </For>
      </TabsV2>
    </Show>
  )
}

export function SettingsTabSettings() {
  const language = useLanguage()
  return (
    <SettingsSections
      page={{ nav: "list", title: "void.settings.title", subtitle: "void.settings.subtitle" }}
      sections={[
        {
          value: "general",
          icon: "sliders",
          title: () => language.t("settings.tab.general"),
          content: () => <SettingsGeneralV2 />,
        },
        {
          value: "shortcuts",
          icon: "keyboard",
          title: () => language.t("settings.tab.shortcuts"),
          content: () => <SettingsKeybinds v2 />,
        },
        {
          value: "servers",
          icon: "server",
          title: () => language.t("status.popover.tab.servers"),
          content: () => <SettingsServersV2 />,
        },
      ]}
    />
  )
}

export function SettingsTabModels() {
  const language = useLanguage()
  return (
    <SettingsSections
      page={{ nav: "segmented", title: "void.models.title", subtitle: "void.models.subtitle" }}
      sections={[
        {
          value: "providers",
          icon: "providers",
          title: () => language.t("settings.providers.title"),
          content: () => <SettingsProvidersV2 directory={() => undefined} />,
        },
        {
          value: "models",
          icon: "models",
          title: () => language.t("settings.models.title"),
          content: () => <SettingsModelsV2 />,
        },
      ]}
    />
  )
}
