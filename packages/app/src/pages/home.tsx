import { SettingsPanel } from "@/components/settings-v2"
import { usePlatform } from "@/context/platform"
import { HomeNav } from "./home/home-nav"

export function NewHome() {
  const platform = usePlatform()
  return (
    <div
      class={`
        m-2 flex min-h-0 flex-1 gap-4 self-stretch overflow-hidden rounded-[10px] p-3
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <aside class="flex w-[220px] shrink-0 flex-col pt-3">
        <HomeNav class="flex" onOpenHelp={() => platform.openExternal("https://opencode.ai/desktop-feedback")} />
      </aside>
      <main data-component="home-panel" class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SettingsPanel />
      </main>
    </div>
  )
}
