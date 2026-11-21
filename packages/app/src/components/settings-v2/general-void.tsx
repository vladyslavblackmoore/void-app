import { Component, For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import type { HomeSessionEvents, HomeSessionIndex } from "@/context/global-sync/home-session-index"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSettings } from "@/context/settings"
import { densityOptions } from "@/context/void-appearance"
import { switchToSpace } from "@/spaces/model"
import type { SpaceSummary } from "@/spaces/types"
import { useUpdaterAction } from "../updater-action"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { useVoidTheme } from "../void/use-void-theme"
import { useVoidCopy } from "./use-void-copy"
import { SettingsGeneralV2, LanguageSetting } from "./general"
import { createAppearanceSettingsController } from "./general-controllers"
import {
  isColorScheme,
  notificationsEnabled,
  schemeSegments,
  sessionsKey,
  spaceRows,
  voidDataFolder,
  voidGeneralLayout,
} from "./settings-void-model"
import "./settings-v2.css"

const Card: Component<{ title: string; children: JSX.Element; slot: string }> = (props) => (
  <div class="settings-v2-section" data-void-card={props.slot}>
    <h3 class="settings-v2-section-title">{props.title}</h3>
    {props.children}
  </div>
)

const ToggleRow: Component<{
  action: string
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = (props) => (
  <SettingsRowV2 title={props.title} description={props.description}>
    <div data-action={props.action}>
      <Switch checked={props.checked} onChange={props.onChange} />
    </div>
  </SettingsRowV2>
)

const SpacesColumn: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const serverSync = useServerSync()
  const [starting, setStarting] = createSignal<ReadonlySet<string>>(new Set())
  const [spaces, { refetch }] = createResource(
    () => platform.spaces,
    (source) => source.list().catch(() => []),
  )
  const [defaultId, { refetch: refetchDefault }] = createResource(
    () => platform.spaces,
    (source) => source.getViewed().catch(() => undefined),
  )
  const index = useQuery(() => ({
    queryKey: serverSync().homeSessions.indexKey,
    queryFn: async () => ({ sessions: [], eventSequence: 0 }) as HomeSessionIndex,
    enabled: false,
  }))
  const events = useQuery(() => ({
    queryKey: serverSync().homeSessions.eventsKey,
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    enabled: false,
  }))
  const viewed = () => ServerConnection.space(server.current)
  const sessions = createMemo(() => {
    const id = viewed()
    if (!id || !index.data) return undefined
    return { [id]: serverSync().homeSessions.sessions(index.data, events.data).length }
  })
  const rows = createMemo(() =>
    spaceRows(spaces.latest ?? [], starting(), { defaultId: defaultId.latest, sessions: sessions() }),
  )

  const mark = (id: string, on: boolean) =>
    setStarting((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const start = (id: string) => {
    const source = platform.spaces
    if (!source) return
    mark(id, true)
    void source
      .start(id)
      .catch(() => undefined)
      .then(() => refetch())
      .finally(() => mark(id, false))
  }

  const chooseDefault = (summary: SpaceSummary | null) => {
    const source = platform.spaces
    if (!source || !summary || summary.id === defaultId.latest) return
    void switchToSpace({
      spaces: source,
      summary,
      register: server.register,
      activate: server.setActive,
    })
      .catch(() => undefined)
      .then(() => Promise.all([refetch(), refetchDefault()]))
  }

  const meta = (row: ReturnType<typeof rows>[number]) => {
    const key = sessionsKey(row.sessions)
    const kind = language.t(`void.settings.spaces.class.${row.class}`)
    if (!key) return kind
    return `${kind} · ${language.t(key, { count: row.sessions! })}`
  }

  return (
    <>
      <Card title={language.t("void.settings.spaces.title")} slot="spaces">
        <div class="void-space-list">
          <For each={rows()}>
            {(row) => (
              <div class="void-space-row" data-core={row.core} style={{ "--space": row.color }}>
                <span class="void-space-dot" aria-hidden="true" />
                <div class="void-space-main">
                  <div class="void-space-name">{row.name}</div>
                  <div class="void-space-meta">{meta(row)}</div>
                </div>
                <Show when={row.isDefault}>
                  <span class="void-space-tag">{language.t("void.settings.spaces.default")}</span>
                </Show>
                <span class="void-space-core" aria-hidden="true" />
                <span class="void-space-state">{language.t(`void.settings.spaces.core.${row.core}`)}</span>
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  data-action={row.action}
                  disabled={!row.canStart}
                  onClick={() => start(row.id)}
                >
                  {language.t(`void.settings.spaces.${row.action}`)}
                </ButtonV2>
              </div>
            )}
          </For>
        </div>
        <p class="void-space-hint">{language.t("void.settings.spaces.hint")}</p>
      </Card>

      <Card title={language.t("void.settings.defaultSpace.title")} slot="defaultSpace">
        <SettingsListV2>
          <SettingsRowV2
            title={language.t("void.settings.defaultSpace.open.title")}
            description={language.t("void.settings.defaultSpace.open.description")}
          >
            <SelectV2
              appearance="inline"
              data-action="settings-default-space"
              options={spaces.latest ?? []}
              current={(spaces.latest ?? []).find((space) => space.id === defaultId.latest)}
              placement="bottom-end"
              gutter={6}
              value={(space) => space.id}
              label={(space) => space.name}
              onSelect={chooseDefault}
            />
          </SettingsRowV2>
        </SettingsListV2>
      </Card>
    </>
  )
}

const DataCard: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSync = useServerSync()
  const folder = createMemo(() => voidDataFolder(serverSync().data.path.home))
  return (
    <Card title={language.t("void.settings.data.title")} slot="data">
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("void.settings.data.folder.title")}
          description={<span class="void-data-path">{folder()?.label ?? language.t("void.settings.data.unknown")}</span>}
        >
          <ButtonV2
            size="normal"
            variant="neutral"
            data-action="settings-reveal-data"
            disabled={!folder()}
            onClick={() => {
              const target = folder()?.path
              if (target) void platform.revealPath?.(target)
            }}
          >
            {language.t("void.settings.data.reveal")}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </Card>
  )
}

export const SettingsGeneralVoid: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const copy = useVoidCopy()
  const settings = useSettings()
  const updater = useUpdaterAction()
  const appearance = createAppearanceSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")
  const layout = createMemo(() =>
    voidGeneralLayout({ spaces: platform.spaces !== undefined, dataFolder: platform.revealPath !== undefined }),
  )

  const setNotifications = (checked: boolean) => {
    settings.notifications.setAgent(checked)
    settings.notifications.setPermissions(checked)
    settings.notifications.setErrors(checked)
  }

  return (
    <div class="settings-v2-tab-body void-general">
      <div class="void-general-col">
        <Card title={language.t("settings.tab.general")} slot="general">
          <SettingsListV2>
            <LanguageSetting />
            <ToggleRow
              action="settings-notifications"
              title={language.t("void.settings.notifications.title")}
              description={language.t("void.settings.notifications.description")}
              checked={notificationsEnabled({
                agent: settings.notifications.agent(),
                permissions: settings.notifications.permissions(),
                errors: settings.notifications.errors(),
              })}
              onChange={setNotifications}
            />
            <Show when={desktop()}>
              <SettingsRowV2
                title={language.t("settings.updates.row.check.title")}
                description={language.t("settings.updates.row.check.description")}
              >
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  disabled={!updater.action().run}
                  onClick={() => updater.run()}
                >
                  {language.t(updater.action().label)}
                </ButtonV2>
              </SettingsRowV2>
            </Show>
          </SettingsListV2>
        </Card>

        <Card title={language.t("settings.general.section.appearance")} slot="appearance">
          <div class="void-appearance-label">{language.t("settings.general.row.colorScheme.title")}</div>
          <SegmentedControlV2
            class="segmented-control-v2--full-width void-appearance-scheme"
            data-action="settings-color-scheme"
            value={appearance.scheme.current()}
            onChange={(value) => isColorScheme(value) && appearance.scheme.select(value)}
            aria-label={language.t("settings.general.row.colorScheme.title")}
          >
            <For each={schemeSegments}>
              {(segment) => (
                <SegmentedControlItemV2 value={segment.value}>{language.t(segment.label)}</SegmentedControlItemV2>
              )}
            </For>
          </SegmentedControlV2>
          <p class="void-appearance-note">{copy("settings.general.row.colorScheme.description")}</p>
          <SettingsListV2>
            <ToggleRow
              action="settings-glows"
              title={language.t("void.settings.appearance.glows.title")}
              description={language.t("void.settings.appearance.glows.description")}
              checked={settings.appearance.glows()}
              onChange={(checked) => settings.appearance.setGlows(checked)}
            />
            <ToggleRow
              action="settings-dot-grid"
              title={language.t("void.settings.appearance.grid.title")}
              description={language.t("void.settings.appearance.grid.description")}
              checked={settings.appearance.dotGrid()}
              onChange={(checked) => settings.appearance.setDotGrid(checked)}
            />
            <ToggleRow
              action="settings-reduce-motion"
              title={language.t("void.settings.appearance.motion.title")}
              description={language.t("void.settings.appearance.motion.description")}
              checked={settings.appearance.reduceMotion()}
              onChange={(checked) => settings.appearance.setReduceMotion(checked)}
            />
            <SettingsRowV2
              title={language.t("void.settings.appearance.density.title")}
              description={language.t("void.settings.appearance.density.description")}
            >
              <SelectV2
                appearance="inline"
                data-action="settings-density"
                options={[...densityOptions]}
                current={settings.appearance.density()}
                placement="bottom-end"
                gutter={6}
                label={(option) => language.t(`void.settings.appearance.density.${option}`)}
                onSelect={(option) => option && settings.appearance.setDensity(option)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </Card>
      </div>

      <div class="void-general-col">
        <Show when={layout().right.includes("spaces")}>
          <SpacesColumn />
        </Show>
        <Show when={layout().right.includes("data")}>
          <DataCard />
        </Show>
      </div>
    </div>
  )
}

export const SettingsGeneralRoute: Component = () => {
  const isVoid = useVoidTheme()
  return (
    <Show when={isVoid()} fallback={<SettingsGeneralV2 />}>
      <SettingsGeneralVoid />
    </Show>
  )
}
