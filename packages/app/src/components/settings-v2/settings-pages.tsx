import { createSignal, For, startTransition, type Component } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { TabsV2 } from "@opencode-ai/ui/v2/tabs-v2"
import { useLanguage } from "@/context/language"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsServersV2 } from "./servers"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import "./settings-v2.css"

type Section = {
  value: string
  icon: "sliders" | "keyboard" | "server" | "providers" | "models"
  title: () => string
  content: Component
}

function SettingsSections(props: { sections: Section[] }) {
  const [tab, setTab] = createSignal(props.sections[0]?.value ?? "")

  return (
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
  )
}

export function SettingsTabSettings() {
  const language = useLanguage()
  return (
    <SettingsSections
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
