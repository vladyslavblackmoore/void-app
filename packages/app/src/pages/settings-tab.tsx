import { Match, Switch } from "solid-js"
import { Navigate, useNavigate, useParams } from "@solidjs/router"
import { AgentsDiagram } from "@/components/agents/agents-diagram"
import { useSettingsCommand } from "@/components/settings-dialog"
import { HomeUtilityNav } from "@/pages/home/home-projects-view"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { isSettingsTabPage, settingsTabHref } from "@/context/settings-tabs"
import { SettingsTabModels, SettingsTabSettings } from "@/components/settings-v2/settings-pages"

export default function SettingsTabPage() {
  const params = useParams<{ page?: string }>()
  useSettingsCommand()
  const language = useLanguage()
  const platform = usePlatform()
  const navigate = useNavigate()
  const page = () => (isSettingsTabPage(params.page) ? params.page : undefined)

  return (
    <div class="flex h-full w-full min-h-0 min-w-0">
      <aside class="hidden w-[280px] shrink-0 flex-col justify-end pl-6 pt-14 lg:flex">
        <HomeUtilityNav
          class="mb-8 flex"
          language={language}
          settingsPage={page}
          onOpenSettingsPage={(next) => navigate(settingsTabHref(next))}
          onOpenHelp={() => platform.openExternal("https://opencode.ai/desktop-feedback")}
        />
      </aside>
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
