import { Match, Switch } from "solid-js"
import { Navigate, useParams } from "@solidjs/router"
import { AgentsDiagram } from "@/components/agents/agents-diagram"
import { useSettingsCommand } from "@/components/settings-dialog"
import { SettingsTabModels, SettingsTabSettings } from "@/components/settings-v2/settings-pages"

export default function SettingsTabPage() {
  const params = useParams<{ page?: string }>()
  useSettingsCommand()

  return (
    <div class="h-full w-full min-h-0 min-w-0">
      <Switch fallback={<Navigate href="/" />}>
        <Match when={params.page === "agents"}>
          <AgentsDiagram />
        </Match>
        <Match when={params.page === "models"}>
          <SettingsTabModels />
        </Match>
        <Match when={params.page === "settings"}>
          <SettingsTabSettings />
        </Match>
      </Switch>
    </div>
  )
}
