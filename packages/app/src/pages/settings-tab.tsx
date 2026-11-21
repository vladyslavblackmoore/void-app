import { Match, Switch } from "solid-js"
import { Navigate, useParams } from "@solidjs/router"
import { AgentsDiagram } from "@/components/agents/agents-diagram"
import { useSettingsCommand } from "@/components/settings-dialog"
import { createHomeController } from "@/pages/home/home-controller"
import { HomeProjects } from "@/pages/home/home-projects"
import { createHomeProjectsController } from "@/pages/home/home-projects-controller"
import { SettingsTabModels, SettingsTabSettings } from "@/components/settings-v2/settings-pages"
import "./settings-tab.css"

export default function SettingsTabPage() {
  const params = useParams<{ page?: string }>()
  useSettingsCommand()
  const home = createHomeController()
  const projects = createHomeProjectsController(home)

  return (
    <div class="flex h-full w-full min-h-0 min-w-0">
      <div data-slot="settings-tab-sidebar" class="hidden w-[304px] shrink-0 pl-6 lg:block [container-type:size]">
        <HomeProjects projects={projects} onWheel={() => {}} />
      </div>
      <div class="h-full min-h-0 min-w-0 flex-1">
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
    </div>
  )
}
