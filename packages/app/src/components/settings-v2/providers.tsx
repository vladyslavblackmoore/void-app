import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { modelNote, providerNote } from "@/components/provider-notes"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { showToast } from "@/utils/toast"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createEffect, createMemo, createSignal, on, type Accessor, type Component, For, Show } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { loadSpaceAgentsQuery } from "@/context/global-sync/bootstrap"
import { buildAgentsDiagram, mainAgentName } from "../agents/agents-diagram-model"
import { useLanguage } from "@/context/language"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { DialogConnectProvider, useProviderConnectController } from "../dialog-connect-provider"
import { DialogCustomProvider } from "../dialog-custom-provider"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useVoidTheme } from "../void/use-void-theme"
import { providerLabel, providerSlug } from "../void/provider-branding"
import { SettingsListV2 } from "./parts/list"
import { providerCards, visibleModelTags, type ProviderCard } from "./provider-cards-model"
import {
  defaultModelGroups,
  defaultModelPanel,
  defaultModelPatch,
  effortControl,
  inheritedBy,
  isDraftDirty,
  selectDefaultModel,
  type DefaultDraft,
} from "./default-model-panel-model"
import "./settings-v2.css"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const PROVIDER_ICON_SIZE = 16
const CARD_TAG_LIMIT = 2

export const SettingsProvidersV2: Component<{
  directory: Accessor<string | undefined>
  onBack?: () => void
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const protocol = useServerProtocol()
  const serverSync = useServerSync()
  const providers = useProviders(props.directory)
  const providerConnect = useProviderConnectController({ onBack: props.onBack })
  const isVoid = useVoidTheme()

  const connect = (provider?: string) => {
    providerConnect.select(provider)
    void dialog.show(() => <DialogConnectProvider directory={props.directory} controller={providerConnect} />)
  }

  const connected = createMemo(() => {
    return providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input))
  })

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .popular()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id))
    return items
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const type = (item: ProviderItem) => {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: ProviderItem) =>
    source(item) !== "env" && (protocol() === "v1" || !isConfigCustom(item.id))

  const note = providerNote

  const isConfigCustom = (providerID: string) => {
    const provider = serverSync().data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    if (protocol() !== "v1") return
    const before = serverSync().data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    serverSync().set("config", "disabled_providers", next)

    await serverSync()
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        serverSync().set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await serverSdk()
        .client.auth.remove({ providerID })
        .catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await serverSdk()
      .client.auth.remove({ providerID })
      .then(async () => {
        await serverSdk().client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const cards = createMemo(() =>
    providerCards({
      connected: connected().map((item) => ({
        id: item.id,
        name: item.name,
        models: Object.values(item.models).map((model) => model.name),
        source: source(item),
      })),
      available: popular().map((item) => ({
        id: item.id,
        name: item.name,
        models: Object.values(item.models).map((model) => model.name),
      })),
    }),
  )

  const choices = createMemo(() =>
    providers.connected().map((item) => ({
      id: item.id,
      name: item.name,
      models: Object.fromEntries(
        Object.entries(item.models).map(([id, model]) => [id, { name: model.name, variants: model.variants }]),
      ),
    })),
  )

  const spaceAgents = useQuery(() => loadSpaceAgentsQuery(serverSdk().scope, serverSdk().client, serverSdk().protocol))
  const mainName = createMemo(() => mainAgentName(spaceAgents.data ?? []))

  const panel = createMemo(() => {
    const config = serverSync().data.config
    return defaultModelPanel({
      model: config.model,
      variant: config.agent?.[mainName()]?.variant,
      providers: choices(),
      isVoid: true,
    })
  })

  const groups = createMemo(() => defaultModelGroups(choices(), true))
  const saved = createMemo<DefaultDraft>(() => {
    const config = serverSync().data.config
    return { model: config.model || undefined, variant: config.agent?.[mainName()]?.variant || undefined }
  })
  const [draft, setDraft] = createSignal<DefaultDraft>(saved())
  createEffect(on(saved, (value) => setDraft(value), { defer: true }))
  const effort = createMemo(() => effortControl(groups(), draft().model))
  const dirty = createMemo(() => isDraftDirty(draft(), saved()))
  const modelCount = createMemo(() => groups().reduce((total, group) => total + group.models.length, 0))
  const [saving, setSaving] = createSignal(false)

  const inherited = createMemo(() => {
    const agents = spaceAgents.data
    if (!agents) return undefined
    const diagram = buildAgentsDiagram({
      agents,
      config: serverSync().data.config.agent,
      providers: providers.connected(),
      configModel: serverSync().data.config.model,
    })
    return inheritedBy([diagram.main, ...diagram.subagents])
  })

  const saveDefault = () => {
    const patch = defaultModelPatch(draft(), mainName())
    if (!patch) return
    setSaving(true)
    serverSync()
      .updateConfig(patch)
      .catch((err: unknown) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => setSaving(false))
  }

  const DefaultModelPanel = () => (
    <aside class="void-default-model" data-component="void-default-model" data-state={panel().state}>
      <h2 class="void-default-model-title">{language.t("void.models.default.title")}</h2>
      <p class="void-default-model-meta">{language.t("void.models.default.meta")}</p>
      <div class="void-default-model-label">
        <span>{language.t("void.models.default.model")}</span>
        <small>{language.t("void.models.default.options", { count: modelCount() })}</small>
      </div>
      <Show
        when={groups().length > 0}
        fallback={<span class="void-default-model-empty">{language.t("void.models.default.noModels")}</span>}
      >
        <div class="void-default-model-options" role="radiogroup" aria-label={language.t("void.models.default.model")}>
          <For each={groups()}>
            {(group) => (
              <>
                <div class="void-default-model-group">{group.name}</div>
                <For each={group.models}>
                  {(option) => (
                    <button
                      type="button"
                      role="radio"
                      class="void-default-model-option"
                      aria-checked={draft().model === option.ref}
                      onClick={() => setDraft((current) => selectDefaultModel(current, option.ref, groups()))}
                    >
                      <span class="void-default-model-radio" aria-hidden="true" />
                      <span class="void-default-model-name">{option.name}</span>
                      <Show when={option.variants.length > 0}>
                        <span class="void-default-model-provider">
                          {language.t("agents.editor.levels", { count: option.variants.length })}
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </Show>
      <Show when={panel().state === "unavailable"}>
        <p class="void-default-model-warn" role="status">
          {language.t("void.models.default.unavailable")}
        </p>
      </Show>
      <div class="void-default-model-label">
        <span>{language.t("void.models.default.effort")}</span>
        <small>{language.t("void.models.default.effort.hint")}</small>
      </div>
      <SegmentedControlV2
        class="segmented-control-v2--full-width"
        aria-label={language.t("void.models.default.effort")}
        value={effort().live ? (draft().variant ?? null) : null}
        disabled={!effort().live}
        allowDeselect
        onChange={(next) => setDraft((current) => ({ ...current, variant: next ?? undefined }))}
      >
        <For each={effort().values}>
          {(variant) => <SegmentedControlItemV2 value={variant}>{variant}</SegmentedControlItemV2>}
        </For>
      </SegmentedControlV2>
      <Show when={!effort().live}>
        <p class="void-default-model-note" data-component="void-default-model-effort-note">
          {language.t("void.models.default.effort.none")}
        </p>
      </Show>
      <Show when={inherited()}>
        {(value) => (
          <>
            <div class="void-default-model-label">
              <span>{language.t("void.models.default.inherited")}</span>
              <small>{language.t("void.models.default.inherited.hint")}</small>
            </div>
            <div class="void-default-model-inherited">
              <For each={value().names}>{(name) => <span class="void-default-model-chip">{name}</span>}</For>
              <Show when={value().own > 0}>
                <span class="void-default-model-chip" data-muted="">
                  {language.t("void.models.default.inherited.own", { count: value().own })}
                </span>
              </Show>
            </div>
          </>
        )}
      </Show>
      <div class="void-default-model-actions">
        <ButtonV2 variant="outline" disabled={!dirty() || saving()} onClick={() => setDraft(saved())}>
          {language.t("common.reset")}
        </ButtonV2>
        <ButtonV2 variant="contrast" disabled={!dirty() || !draft().model || saving()} onClick={saveDefault}>
          {language.t("common.save")}
        </ButtonV2>
      </div>
    </aside>
  )

  const cardType = (card: ProviderCard) => {
    const item = connected().find((entry) => entry.id === card.id)
    return item ? type(item) : undefined
  }

  const CardButton = (cardProps: { card: ProviderCard }) => (
    <>
      <Show when={cardProps.card.action === "connect"}>
        <ButtonV2 size="normal" variant="neutral" onClick={() => connect(cardProps.card.id)}>
          {language.t("common.connect")}
        </ButtonV2>
      </Show>
      <Show when={cardProps.card.action === "disconnect"}>
        <ButtonV2
          size="normal"
          variant="neutral"
          onClick={() => void disconnect(cardProps.card.id, cardProps.card.name)}
        >
          {language.t("common.disconnect")}
        </ButtonV2>
      </Show>
      <Show when={cardProps.card.action === "none"}>
        <span class="void-provider-card-hint">{language.t("settings.providers.connected.environmentDescription")}</span>
      </Show>
    </>
  )

  const VoidProviders = () => (
    <div class="void-providers-layout" data-component="void-providers-layout">
      <div class="void-provider-grid" data-component="void-provider-grid">
        <For each={cards()}>
          {(card) => {
            const tags = () => visibleModelTags(card.models, CARD_TAG_LIMIT)
            return (
              <div class="void-provider-card" data-status={card.status} data-provider={card.id}>
                <div class="void-provider-card-top">
                  <span class="void-provider-card-icon">
                    <ProviderIcon id={card.id} width={20} height={20} />
                  </span>
                  <div class="void-provider-card-head">
                    <span class="void-provider-card-name">{providerLabel(true, card.id, card.name)}</span>
                    <span class="void-provider-card-state">
                      <StatusDotV2 tone={card.tone} />
                      {language.t(
                        card.status === "connected"
                          ? "void.models.status.connected"
                          : "void.models.status.disconnected",
                      )}
                    </span>
                  </div>
                </div>
                <p class="void-provider-card-line">
                  {card.modelCount > 0
                    ? language.t("void.models.count", { count: card.modelCount })
                    : language.t("void.models.noModels")}
                </p>
                <div class="void-provider-card-tags">
                  <For each={tags().tags}>{(tag) => <span class="void-provider-tag">{tag}</span>}</For>
                  <Show when={tags().more > 0}>
                    <span class="void-provider-tag">{language.t("void.models.moreTags", { count: tags().more })}</span>
                  </Show>
                </div>
                <div class="void-provider-card-foot">
                  <span class="void-provider-card-id">{cardType(card) ?? providerSlug(true, card.id)}</span>
                  <CardButton card={card} />
                </div>
              </div>
            )
          }}
        </For>
        <Show when={protocol() === "v1"}>
          <div class="void-provider-card" data-status="disconnected" data-component="custom-provider-section">
            <div class="void-provider-card-top">
              <span class="void-provider-card-icon">
                <ProviderIcon id="synthetic" width={20} height={20} />
              </span>
              <div class="void-provider-card-head">
                <span class="void-provider-card-name">{language.t("provider.custom.title")}</span>
                <span class="void-provider-card-state">{language.t("settings.providers.tag.custom")}</span>
              </div>
            </div>
            <p class="void-provider-card-line">{language.t("settings.providers.custom.description")}</p>
            <div class="void-provider-card-foot">
              <span class="void-provider-card-id">{language.t("void.models.card.custom")}</span>
              <ButtonV2
                size="normal"
                variant="neutral"
                onClick={() => {
                  dialog.show(() => <DialogCustomProvider onBack={dialog.close} />)
                }}
              >
                {language.t("common.connect")}
              </ButtonV2>
            </div>
          </div>
        </Show>
        <button type="button" class="settings-v2-providers-view-all" onClick={() => connect()}>
          {language.t("dialog.provider.viewAll")}
        </button>
      </div>
      <DefaultModelPanel />
    </div>
  )

  return (
    <Show when={!isVoid()} fallback={<VoidProviders />}>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.providers.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-providers">
        <div class="settings-v2-section" data-component="connected-providers-section">
          <h3 class="settings-v2-section-title">{language.t("settings.providers.section.connected")}</h3>
          <SettingsListV2>
            <Show
              when={connected().length > 0}
              fallback={
                <div class="settings-v2-provider-empty">{language.t("settings.providers.connected.empty")}</div>
              }
            >
              <For each={connected()}>
                {(item) => (
                  <div class="settings-v2-provider-row group">
                    <div class="settings-v2-provider-lead">
                      <ProviderIcon
                        id={item.id}
                        width={PROVIDER_ICON_SIZE}
                        height={PROVIDER_ICON_SIZE}
                        class="settings-v2-provider-icon shrink-0"
                      />
                      <div class="settings-v2-provider-copy">
                        <div class="settings-v2-provider-main">
                          <span class="settings-v2-provider-name truncate">{item.name}</span>
                          <Tag>{type(item)}</Tag>
                        </div>
                        <Show when={modelNote(item.id)}>
                          {(key) => <p class="settings-v2-provider-description">{language.t(key())}</p>}
                        </Show>
                      </div>
                    </div>
                    <Show
                      when={canDisconnect(item)}
                      fallback={
                        <span class="settings-v2-provider-env-hint">
                          {language.t("settings.providers.connected.environmentDescription")}
                        </span>
                      }
                    >
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => void disconnect(item.id, item.name)}>
                        {language.t("common.disconnect")}
                      </ButtonV2>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.providers.section.popular")}</h3>
          <SettingsListV2>
            <For each={popular()}>
              {(item) => (
                <div class="settings-v2-provider-row">
                  <div class="settings-v2-provider-lead">
                    <ProviderIcon
                      id={item.id}
                      width={PROVIDER_ICON_SIZE}
                      height={PROVIDER_ICON_SIZE}
                      class="settings-v2-provider-icon shrink-0"
                    />
                    <div class="settings-v2-provider-copy">
                      <div class="settings-v2-provider-main">
                        <span class="settings-v2-provider-name">{item.name}</span>
                        <Show when={item.id === "opencode" || item.id === "opencode-go"}>
                          <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                        </Show>
                      </div>
                      <Show when={note(item.id)}>
                        {(key) => <p class="settings-v2-provider-description">{language.t(key())}</p>}
                      </Show>
                    </div>
                  </div>
                  <ButtonV2 size="normal" variant="neutral" icon="plus" onClick={() => connect(item.id)}>
                    {language.t("common.connect")}
                  </ButtonV2>
                </div>
              )}
            </For>

            <Show when={protocol() === "v1"}>
              <div class="settings-v2-provider-row" data-component="custom-provider-section">
                <div class="settings-v2-provider-lead">
                  <ProviderIcon
                    id="synthetic"
                    width={PROVIDER_ICON_SIZE}
                    height={PROVIDER_ICON_SIZE}
                    class="settings-v2-provider-icon shrink-0"
                  />
                  <div class="settings-v2-provider-copy">
                    <div class="settings-v2-provider-main">
                      <span class="settings-v2-provider-name">{language.t("provider.custom.title")}</span>
                      <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                    </div>
                    <p class="settings-v2-provider-description">
                      {language.t("settings.providers.custom.description")}
                    </p>
                  </div>
                </div>
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  icon="plus"
                  onClick={() => {
                    dialog.show(() => <DialogCustomProvider onBack={dialog.close} />)
                  }}
                >
                  {language.t("common.connect")}
                </ButtonV2>
              </div>
            </Show>
          </SettingsListV2>

          <button type="button" class="settings-v2-providers-view-all" onClick={() => connect()}>
            {language.t("dialog.provider.viewAll")}
          </button>
        </div>
      </div>
    </Show>
  )
}
