import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"

import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { applyCoreStatus, menuSpaces, switchToSpace, visibleCoreState } from "@/spaces/model"
import { useVoidTheme } from "./void/use-void-theme"
import { spaceIdentityColor, spaceRowCore } from "./void/space-chip-model"
import "./void/void-space-menu.css"

const itemClass =
  "h-7 gap-2 rounded-sm px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base [font-family:var(--v2-font-family-sans)] data-[highlighted]:!bg-v2-overlay-simple-overlay-hover"

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 1.4,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": true,
} as const

function Dot(props: { color: string }) {
  return (
    <span
      data-slot="space-dot"
      class="size-2 shrink-0 rounded-full"
      style={{ "background-color": props.color }}
      aria-hidden="true"
    />
  )
}

export function SpaceSwitcher() {
  const platform = usePlatform()
  const server = useServer()
  const language = useLanguage()
  const isVoid = useVoidTheme()
  const [open, setOpen] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const viewed = () => ServerConnection.space(server.current)
  const [spaces, { refetch }] = createResource(
    () => (platform.spaces ? open() : undefined),
    () => platform.spaces!.list().catch(() => []),
  )
  const [known] = createResource(
    () => (platform.spaces ? viewed() : undefined),
    () => platform.spaces!.list().catch(() => []),
  )
  const items = () => menuSpaces(spaces.latest ?? known.latest ?? [], viewed())
  const label = () => items().find((item) => item.viewed)
  const [coreStatus, setCoreStatus] = createSignal<{ space: string; state: "restarting" | "up" | "failed" }>()
  const coreState = () => visibleCoreState(coreStatus(), viewed())
  const rowCore = (id: string | undefined) =>
    spaceRowCore((spaces.latest ?? known.latest ?? []).find((item) => item.id === id), id === viewed() ? coreState() : undefined)
  const core = () => rowCore(viewed())
  let clear: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    viewed()
    clearTimeout(clear)
    setCoreStatus(undefined)
  })

  createEffect(() => {
    const subscribe = platform.spaces?.onCoreStatus
    if (!subscribe) return
    const off = subscribe((status) => {
      const shown = applyCoreStatus({
        status,
        viewed: viewed(),
        name: label()?.name ?? status.space,
        register: server.register,
        activate: server.setActive,
      })
      if (!shown) return
      clearTimeout(clear)
      setCoreStatus({ space: status.space, state: shown })
      if (shown === "up") clear = setTimeout(() => setCoreStatus(undefined), 4000)
    })
    onCleanup(() => {
      off()
      clearTimeout(clear)
    })
  })

  const retry = () => {
    const id = viewed()
    const space = platform.spaces
    if (!space || !id) return
    setCoreStatus({ space: id, state: "restarting" })
    switchToSpace({
      spaces: space,
      summary: { id, name: label()?.name ?? id },
      register: server.register,
      activate: server.setActive,
    }).catch(() => setCoreStatus({ space: id, state: "failed" }))
  }

  const choose = (id: string) => {
    const space = platform.spaces
    const summary = (spaces.latest ?? known.latest ?? []).find((item) => item.id === id)
    if (!space || !summary || id === viewed()) return
    setFailed(false)
    switchToSpace({
      spaces: space,
      summary,
      register: server.register,
      activate: server.setActive,
    }).catch(() => {
      setFailed(true)
      void refetch()
    })
  }

  return (
    <Show when={platform.spaces && viewed() !== undefined && label()}>
      {(current) => (
        <DropdownMenu gutter={4} modal={false} placement="bottom-start" onOpenChange={setOpen}>
          <DropdownMenu.Trigger
            data-component="space-switcher"
            data-void-chip={isVoid() ? "" : undefined}
            data-core={isVoid() ? core() : undefined}
            style={isVoid() ? { "--space": spaceIdentityColor(current()) } : undefined}
            title={isVoid() ? language.t(`void.space.core.${core()}`) : undefined}
            class={
              isVoid()
                ? undefined
                : "flex h-7 shrink-0 items-center gap-2 rounded-[6px] px-2 text-[13px] font-[440] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
            }
            aria-label={language.t("space.switcher.ariaLabel")}
          >
            <Show
              when={isVoid()}
              fallback={
                <>
                  <Dot color={current().color} />
                  <span class="max-w-[140px] truncate">{current().name}</span>
                </>
              }
            >
              <span data-slot="void-space-dot" aria-hidden="true" />
              <span data-slot="void-space-label">{language.t("void.space.label")}</span>
              <span class="max-w-[140px] truncate">{current().name}</span>
              <span data-slot="void-space-sep" aria-hidden="true" />
              <span data-slot="void-space-core" aria-hidden="true" />
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </Show>
          </DropdownMenu.Trigger>
          <Show when={coreState()}>
            {(state) => (
              <span data-component="space-core-status" data-state={state()} class="text-[11px] text-v2-text-text-weak" role="status">
                {language.t(`space.core.${state()}`)}
                <Show when={state() === "failed"}>
                  <button type="button" class="ml-1 underline" onClick={retry}>
                    {language.t("space.core.retry")}
                  </button>
                </Show>
              </span>
            )}
          </Show>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              data-void-space-menu={isVoid() ? "" : undefined}
              class="min-w-[200px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 p-0.5 shadow-[var(--v2-elevation-floating)] focus:outline-none"
            >
              <DropdownMenu.Group>
                <DropdownMenu.GroupLabel class="px-3 py-1 text-[11px] text-v2-text-text-weak">
                  {language.t("space.switcher.heading")}
                </DropdownMenu.GroupLabel>
                <For each={items()}>
                  {(item) => (
                    <DropdownMenu.Item
                      class={isVoid() ? undefined : itemClass}
                      data-void-selected={isVoid() && item.viewed ? "" : undefined}
                      onSelect={() => choose(item.id)}
                    >
                      <Show
                        when={isVoid()}
                        fallback={
                          <>
                            <Dot color={item.color} />
                            <DropdownMenu.ItemLabel class="min-w-0 flex-1 truncate leading-5">
                              {item.name}
                            </DropdownMenu.ItemLabel>
                            <Show when={item.busy}>
                              <span data-slot="space-busy" class="text-[11px] text-v2-text-text-weak">
                                {language.t("space.switcher.running")}
                              </span>
                            </Show>
                            <Show when={item.viewed}>
                              <span aria-hidden="true">{"✓"}</span>
                            </Show>
                          </>
                        }
                      >
                        <span
                          data-slot="void-space-dot"
                          style={{ "--space": spaceIdentityColor(item) }}
                          aria-hidden="true"
                        />
                        <DropdownMenu.ItemLabel class="min-w-0 flex-1 truncate leading-5">
                          {item.name}
                        </DropdownMenu.ItemLabel>
                        <span data-slot="void-space-status">{language.t(`void.space.status.${rowCore(item.id)}`)}</span>
                        <span data-slot="void-space-core" data-state={rowCore(item.id)} aria-hidden="true" />
                      </Show>
                    </DropdownMenu.Item>
                  )}
                </For>
              </DropdownMenu.Group>
              <Show when={failed()}>
                <div class="px-3 py-1 text-[12px] text-v2-text-text-weak">{language.t("space.switcher.failed")}</div>
              </Show>
              <DropdownMenu.Separator />
              <DropdownMenu.Item class={isVoid() ? undefined : itemClass} disabled>
                <Show when={isVoid()}>
                  <span data-slot="void-space-tile" aria-hidden="true">
                    <svg {...iconProps}>
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </span>
                </Show>
                <DropdownMenu.ItemLabel>{language.t("space.switcher.new")}</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <DropdownMenu.Item class={isVoid() ? undefined : itemClass} disabled>
                <Show when={isVoid()}>
                  <span data-slot="void-space-tile" aria-hidden="true">
                    <svg {...iconProps}>
                      <circle cx="8" cy="8" r="2.2" />
                      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4" />
                    </svg>
                  </span>
                </Show>
                <DropdownMenu.ItemLabel>{language.t("space.switcher.manage")}</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      )}
    </Show>
  )
}
