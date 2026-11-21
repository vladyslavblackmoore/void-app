import { Component, For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useUpdaterAction } from "../updater-action"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { useVoidTheme } from "../void/use-void-theme"
import { useVoidCopy } from "./use-void-copy"
import {
  SettingsGeneralV2,
  FontSetting,
  LanguageSetting,
  PermissionScopeSetting,
  ShellSetting,
  SoundSetting,
} from "./general"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellSettingsController,
  createSoundSettingsController,
} from "./general-controllers"
import { isColorScheme, schemeSegments, spaceRows } from "./settings-void-model"
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

const SpacesCard: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const [starting, setStarting] = createSignal<ReadonlySet<string>>(new Set())
  const [spaces, { refetch }] = createResource(
    () => platform.spaces,
    (source) => source.list().catch(() => []),
  )
  const rows = createMemo(() => spaceRows(spaces.latest ?? [], starting()))

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

  return (
    <Card title={language.t("void.settings.spaces.title")} slot="spaces">
      <div class="void-space-list">
        <For each={rows()}>
          {(row) => (
            <div class="void-space-row" data-core={row.core} style={{ "--space": row.color }}>
              <span class="void-space-dot" aria-hidden="true" />
              <div class="void-space-main">
                <div class="void-space-name">{row.name}</div>
                <div class="void-space-meta">{language.t(`void.settings.spaces.class.${row.class}`)}</div>
              </div>
              <span class="void-space-core" aria-hidden="true" />
              <span class="void-space-state">{language.t(`void.settings.spaces.core.${row.core}`)}</span>
              <ButtonV2
                size="normal"
                variant="neutral"
                disabled={!row.canStart}
                onClick={() => start(row.id)}
              >
                {language.t("void.settings.spaces.start")}
              </ButtonV2>
            </div>
          )}
        </For>
      </div>
      <p class="void-space-hint">{language.t("void.settings.spaces.hint")}</p>
    </Card>
  )
}

export const SettingsGeneralVoid: Component<{ sessionID?: string }> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const copy = useVoidCopy()
  const settings = useSettings()
  const mobile = createMediaQuery("(max-width: 767px)")
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController(() => props.sessionID)
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const sounds = createSoundSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => desktop() && "getPinchZoomEnabled" in platform,
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)
    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.general")}</h2>
      </div>

      <div class="settings-v2-tab-body void-general">
        <div class="void-general-col">
          <Card title={language.t("settings.tab.general")} slot="general">
            <SettingsListV2>
              <LanguageSetting />
              <ToggleRow
                action="settings-notifications-agent"
                title={language.t("settings.general.notifications.agent.title")}
                description={language.t("settings.general.notifications.agent.description")}
                checked={settings.notifications.agent()}
                onChange={(checked) => settings.notifications.setAgent(checked)}
              />
              <ToggleRow
                action="settings-notifications-permissions"
                title={language.t("settings.general.notifications.permissions.title")}
                description={language.t("settings.general.notifications.permissions.description")}
                checked={settings.notifications.permissions()}
                onChange={(checked) => settings.notifications.setPermissions(checked)}
              />
              <ToggleRow
                action="settings-notifications-errors"
                title={language.t("settings.general.notifications.errors.title")}
                description={language.t("settings.general.notifications.errors.description")}
                checked={settings.notifications.errors()}
                onChange={(checked) => settings.notifications.setErrors(checked)}
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
          </Card>
        </div>

        <div class="void-general-col">
          <Show when={platform.spaces}>
            <SpacesCard />
          </Show>

          <Card title={language.t("settings.general.section.advanced")} slot="advanced">
            <SettingsListV2>
              <PermissionScopeSetting controller={permissionScope} />
              <ShellSetting controller={shell} />
              <SoundSetting kind="agent" channel={sounds.agent} />
              <SoundSetting kind="permissions" channel={sounds.permissions} />
              <SoundSetting kind="errors" channel={sounds.errors} />
              <ToggleRow
                action="settings-release-notes"
                title={language.t("settings.general.row.releaseNotes.title")}
                description={language.t("settings.general.row.releaseNotes.description")}
                checked={settings.general.releaseNotes()}
                onChange={(checked) => settings.general.setReleaseNotes(checked)}
              />
              <Show when={desktop()}>
                <ToggleRow
                  action="settings-pinch-zoom"
                  title={language.t("settings.general.row.pinchZoom.title")}
                  description={language.t("settings.general.row.pinchZoom.description")}
                  checked={pinchZoom.latest}
                  onChange={onPinchZoomChange}
                />
              </Show>
              <Show when={appearance.theme.options().length > 1}>
                <SettingsRowV2
                  title={language.t("settings.general.row.theme.title")}
                  description={copy("settings.general.row.theme.description")}
                >
                  <SelectV2
                    appearance="inline"
                    data-action="settings-theme"
                    options={appearance.theme.options()}
                    current={appearance.theme.current()}
                    placement="bottom-end"
                    gutter={6}
                    value={(option) => option.id}
                    label={(option) => option.name}
                    onSelect={appearance.theme.select}
                  />
                </SettingsRowV2>
              </Show>
              <FontSetting kind="ui" fonts={appearance.fonts} />
              <FontSetting kind="code" fonts={appearance.fonts} />
              <FontSetting kind="terminal" fonts={appearance.fonts} />
              <ToggleRow
                action="settings-feed-reasoning-summaries"
                title={language.t("settings.general.row.reasoningSummaries.title")}
                description={language.t("settings.general.row.reasoningSummaries.description")}
                checked={settings.general.showReasoningSummaries()}
                onChange={(checked) => settings.general.setShowReasoningSummaries(checked)}
              />
              <ToggleRow
                action="settings-feed-shell-tool-parts-expanded"
                title={language.t("settings.general.row.shellToolPartsExpanded.title")}
                description={language.t("settings.general.row.shellToolPartsExpanded.description")}
                checked={settings.general.shellToolPartsExpanded()}
                onChange={(checked) => settings.general.setShellToolPartsExpanded(checked)}
              />
              <ToggleRow
                action="settings-feed-edit-tool-parts-expanded"
                title={language.t("settings.general.row.editToolPartsExpanded.title")}
                description={language.t("settings.general.row.editToolPartsExpanded.description")}
                checked={settings.general.editToolPartsExpanded()}
                onChange={(checked) => settings.general.setEditToolPartsExpanded(checked)}
              />
              <Show when={mobile() && import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"}>
                <ToggleRow
                  action="settings-mobile-titlebar-bottom"
                  title={language.t("settings.general.row.mobileTitlebarBottom.title")}
                  description={language.t("settings.general.row.mobileTitlebarBottom.description")}
                  checked={settings.general.mobileTitlebarPosition() === "bottom"}
                  onChange={(checked) => settings.general.setMobileTitlebarPosition(checked ? "bottom" : "top")}
                />
              </Show>
              <ToggleRow
                action="settings-show-file-tree"
                title={language.t("settings.general.row.showFileTree.title")}
                description={language.t("settings.general.row.showFileTree.description")}
                checked={settings.general.showFileTree()}
                onChange={(checked) => settings.general.setShowFileTree(checked)}
              />
              <ToggleRow
                action="settings-show-search"
                title={language.t("settings.general.row.showSearch.title")}
                description={language.t("settings.general.row.showSearch.description")}
                checked={settings.general.showSearch()}
                onChange={(checked) => settings.general.setShowSearch(checked)}
              />
              <ToggleRow
                action="settings-show-status"
                title={language.t("settings.general.row.showStatus.title")}
                description={language.t("settings.general.row.showStatus.description")}
                checked={settings.general.showStatus()}
                onChange={(checked) => settings.general.setShowStatus(checked)}
              />
              <ToggleRow
                action="settings-show-custom-agents"
                title={language.t("settings.general.row.showCustomAgents.title")}
                description={language.t("settings.general.row.showCustomAgents.description")}
                checked={settings.general.showCustomAgents()}
                onChange={(checked) => settings.general.setShowCustomAgents(checked)}
              />
            </SettingsListV2>
          </Card>
        </div>
      </div>
    </>
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
