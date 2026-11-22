import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { type Component, For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"
import {
  agentDefault,
  agentDefaultPatch,
  anyRunning,
  childAgentName,
  formatModelRef,
  mainAgentName,
  mergePatches,
  sameDefault,
  variantNames,
  type ModelRef,
} from "./agent-defaults"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

type Target = "main" | "children"

type ModelOption = { id: string; model: ModelRef; name: string; provider: string; variants: string[] }
type VariantOption = { id: string; name: string }

type Current = { model: ModelRef; variant: string | undefined }
type Choices = Partial<Record<Target, Current>>

const targets: Target[] = ["main", "children"]
const defaultVariantID = "default"

export const SettingsAgentsV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const providers = useProviders(() => undefined)
  const [pending, setPending] = createSignal<Choices>({})
  const [optimistic, setOptimistic] = createSignal<Choices>({})

  const options = createMemo(() =>
    providers.connected().flatMap((provider) =>
      Object.values(provider.models).map(
        (model): ModelOption => ({
          id: formatModelRef({ providerID: provider.id, modelID: model.id }),
          model: { providerID: provider.id, modelID: model.id },
          name: model.name,
          provider: provider.name,
          variants: variantNames(model.variants),
        }),
      ),
    ),
  )

  const config = () => serverSync().data.config
  const agentName = (target: Target) => (target === "main" ? mainAgentName(config()) : childAgentName)

  const stored = (target: Target) => agentDefault(config(), agentName(target))
  const effective = (target: Target) => pending()[target] ?? optimistic()[target] ?? stored(target)
  const pendingTargets = () => targets.filter((target) => pending()[target] !== undefined)

  createEffect(() => {
    const current = optimistic()
    const settled = targets.filter((target) => current[target] && sameDefault(current[target], stored(target)))
    if (settled.length === 0) return
    setOptimistic((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !settled.includes(key as Target))))
  })

  const commit = async (choices: Choices) => {
    const entries = targets.flatMap((target) => {
      const choice = choices[target]
      return choice ? [{ target, choice }] : []
    })
    if (entries.length === 0) return
    setPending({})
    setOptimistic((value) => ({ ...value, ...choices }))
    await serverSync()
      .updateConfig(
        mergePatches(
          entries.map(({ target, choice }) =>
            agentDefaultPatch(agentName(target), choice.model, choice.variant, target === "children"),
          ),
        ),
      )
      .catch((error: unknown) => {
        setOptimistic((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !(key in choices))))
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        })
      })
  }

  const request = (target: Target, model: ModelRef, variant: string | undefined) => {
    const choice = { model, variant }
    if (anyRunning(serverSync().session.data.session_status)) {
      setPending((value) => ({ ...value, [target]: choice }))
      return
    }
    void commit({ [target]: choice })
  }

  const modelName = (id: string | undefined) => {
    const option = options().find((item) => item.id === id)
    return option ? `${option.name} (${option.provider})` : undefined
  }
  const fallback = (target: Target) => {
    const base = config().model
    if (target === "main") {
      const name = modelName(base) ?? base
      return name ? language.t("settings.agents.default.label", { value: name }) : undefined
    }
    const main = effective("main")
    const name = modelName(main ? formatModelRef(main.model) : base) ?? (main ? formatModelRef(main.model) : base)
    return name
      ? language.t("settings.agents.children.inherit.value", { value: name })
      : language.t("settings.agents.children.inherit")
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.agents.title")}</h2>
      </div>

      <div class="settings-v2-tab-body" data-component="settings-agents">
        <div class="settings-v2-section">
          <SettingsListV2>
            <For each={targets}>
              {(target) => (
                <AgentDefaultRow
                  target={target}
                  options={options()}
                  current={effective(target)}
                  fallback={fallback(target)}
                  onChange={(model, variant) => request(target, model, variant)}
                />
              )}
            </For>
          </SettingsListV2>
          <Show when={options().length === 0}>
            <div data-component="settings-agents-empty">{language.t("settings.agents.empty")}</div>
          </Show>
          <Show when={pendingTargets().length > 0}>
            <div data-component="settings-agents-confirm" data-agent-default={pendingTargets().join(" ")}>
                <span>{language.t("settings.agents.confirm.message")}</span>
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  data-action="settings-agents-confirm-apply"
                  onClick={() => void commit(pending())}
                >
                  {language.t("settings.agents.confirm.apply")}
                </ButtonV2>
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  data-action="settings-agents-confirm-cancel"
                  onClick={() => setPending({})}
                >
                  {language.t("settings.agents.confirm.cancel")}
                </ButtonV2>
            </div>
          </Show>
        </div>
      </div>
    </>
  )
}

const AgentDefaultRow: Component<{
  target: Target
  options: ModelOption[]
  current: Current | undefined
  fallback: string | undefined
  onChange: (model: ModelRef, variant: string | undefined) => void
}> = (props) => {
  const language = useLanguage()
  const selected = createMemo(() => {
    const current = props.current
    if (!current) return undefined
    const id = formatModelRef(current.model)
    return props.options.find((option) => option.id === id)
  })
  const variants = createMemo<VariantOption[]>(() => {
    const names = selected()?.variants ?? []
    if (names.length === 0) return []
    return [
      { id: defaultVariantID, name: language.t("settings.agents.variant.default") },
      ...names.filter((id) => id !== defaultVariantID).map((id) => ({ id, name: id })),
    ]
  })
  const currentVariant = createMemo(() => {
    const id = props.current?.variant || defaultVariantID
    return variants().find((option) => option.id === id) ?? variants()[0]
  })

  return (
    <div data-agent-default={props.target}>
      <SettingsRowV2
        title={language.t(`settings.agents.${props.target}.title`)}
        description={language.t(`settings.agents.${props.target}.description`)}
      >
        <div class="flex items-center gap-2">
          <div data-action="settings-agent-model">
            <SelectV2
              appearance="inline"
              data-action="settings-agent-model-select"
              options={props.options}
              current={selected()}
              placeholder={props.fallback ?? language.t("settings.agents.model.placeholder")}
              placement="bottom-end"
              gutter={6}
              value={(option) => option.id}
              label={(option) => option.name}
              groupBy={(option) => option.provider}
              onSelect={(option) => {
                if (!option) return
                const keep = option.variants.includes(props.current?.variant ?? defaultVariantID)
                props.onChange(option.model, keep ? props.current?.variant : undefined)
              }}
            />
          </div>
          <Show when={variants().length > 0}>
            <div data-action="settings-agent-variant">
              <SelectV2
                appearance="inline"
                data-action="settings-agent-variant-select"
                options={variants()}
                current={currentVariant()}
                placement="bottom-end"
                gutter={6}
                value={(option) => option.id}
                label={(option) => option.name}
                onSelect={(option) => {
                  const model = selected()
                  if (!option || !model) return
                  props.onChange(model.model, option.id === defaultVariantID ? undefined : option.id)
                }}
              />
            </div>
          </Show>
        </div>
      </SettingsRowV2>
    </div>
  )
}
