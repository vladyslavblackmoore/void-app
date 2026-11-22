import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Keybind } from "@opencode-ai/ui/keybind"
import { List } from "@opencode-ai/ui/list"
import { createSignal, Match, Show, Switch } from "solid-js"
import { formatKeybind } from "@/context/command"
import { useSettings } from "@/context/settings"
import { getRelativeTime } from "@/utils/time"
import { createCommandPaletteModel, type CommandPaletteEntry } from "./command-palette"
import { DialogCommandPaletteV2 } from "./dialog-command-palette-v2"

export function DialogSelectFile() {
  const settings = useSettings()

  if (settings.general.newLayoutDesigns()) return <DialogCommandPaletteV2 />

  return <DialogSelectFileLegacy />
}

function DialogSelectFileLegacy() {
  const palette = createCommandPaletteModel()
  const [grouped, setGrouped] = createSignal(false)

  const items = async (text: string) => {
    const query = text.trim()
    setGrouped(query.length > 0)

    if (!query) return palette.preferredCommandEntries()

    const nextSessions = await palette.sessions(query)
    return [...palette.commandEntries(), ...nextSessions]
  }

  return (
    <Dialog class="pt-3 pb-0 !max-h-[480px]" transition>
      <List
        class="px-3"
        search={{
          placeholder: palette.language.t("palette.search.placeholder"),
          autofocus: true,
          hideIcon: true,
        }}
        emptyMessage={palette.language.t("palette.empty")}
        loadingMessage={palette.language.t("common.loading")}
        items={items}
        key={(item) => item.id}
        filterKeys={["title", "description", "category"]}
        groupBy={grouped() ? (item) => item.category : () => ""}
        onMove={(item: CommandPaletteEntry | undefined) => palette.highlight(item)}
        onSelect={(item: CommandPaletteEntry | undefined) => palette.select(item)}
      >
        {(item) => (
          <Switch>
            <Match when={item.type === "command"}>
              <div class="w-full flex items-center justify-between gap-4">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-14-regular text-text-strong whitespace-nowrap">{item.title}</span>
                  <Show when={item.description}>
                    <span class="text-14-regular text-text-weak truncate">{item.description}</span>
                  </Show>
                </div>
                <Show when={item.keybind}>
                  <Keybind class="rounded-[4px]">{formatKeybind(item.keybind ?? "", palette.language.t)}</Keybind>
                </Show>
              </div>
            </Match>
            <Match when={item.type === "session"}>
              <div class="w-full flex items-center justify-between rounded-md pl-1">
                <div class="flex items-center gap-x-3 grow min-w-0">
                  <Icon name="bubble-5" size="small" class="shrink-0 text-icon-weak" />
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="text-14-regular text-text-strong truncate"
                      classList={{ "opacity-70": !!item.archived }}
                    >
                      {item.title}
                    </span>
                    <Show when={item.description}>
                      <span
                        class="text-14-regular text-text-weak truncate"
                        classList={{ "opacity-70": !!item.archived }}
                      >
                        {item.description}
                      </span>
                    </Show>
                  </div>
                </div>
                <Show when={item.updated}>
                  <span class="text-12-regular text-text-weak whitespace-nowrap ml-2">
                    {getRelativeTime(new Date(item.updated!).toISOString(), palette.language.t)}
                  </span>
                </Show>
              </div>
            </Match>
          </Switch>
        )}
      </List>
    </Dialog>
  )
}
