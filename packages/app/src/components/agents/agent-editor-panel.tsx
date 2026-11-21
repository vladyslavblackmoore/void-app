import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useTheme } from "@opencode-ai/ui/theme"
import { useLanguage } from "@/context/language"
import {
  buildAgentPatch,
  canSave,
  effortControl,
  groupModels,
  initialDraft,
  selectModel,
  variantsFor,
  type AgentConfigPatch,
  type AgentDraft,
  type FileFields,
} from "./agent-editor"
import { formatModelRef, type AgentNode } from "./agents-diagram-model"

type ProviderList = Parameters<typeof groupModels>[0]

export function AgentEditorPanel(props: {
  node: AgentNode
  locked: FileFields
  providers: ProviderList
  running: boolean
  onSave: (patch: AgentConfigPatch) => Promise<void>
  onClose: () => void
}) {
  const language = useLanguage()
  const theme = useTheme()
  const [draft, setDraft] = createStore<AgentDraft>(initialDraft(props.node))
  const [state, setState] = createStore({ confirming: false, saving: false })
  const groups = createMemo(() => groupModels(props.providers))
  const variants = createMemo(() => variantsFor(props.providers, draft.model))
  const canInherit = () => !props.node.isMain && !props.locked.model
  const selectedRef = () => (draft.inherit || !draft.model ? undefined : formatModelRef(draft.model))

  const apply = async () => {
    setState("saving", true)
    try {
      await props.onSave(buildAgentPatch(props.node.name, { ...draft }, props.locked))
    } finally {
      setState({ saving: false, confirming: false })
    }
  }

  const save = () => {
    if (props.running && !state.confirming) {
      setState("confirming", true)
      return
    }
    void apply()
  }

  return (
    <section
      data-component="agents-panel"
      role="dialog"
      aria-label={props.node.name}
      class="absolute right-6 top-6 z-20 flex max-h-[calc(100%-48px)] w-[384px] flex-col gap-4 overflow-y-auto rounded-3xl p-5 text-v2-text-text-base"
    >
      <div class="flex flex-col gap-1">
        <h3 class="flex items-center gap-2 text-[17px] font-medium">
          <span data-slot="agents-dot" data-status={props.node.status} class="size-2 rounded-full" />
          {props.node.name}
        </h3>
        <Show when={props.node.description}>
          <p class="text-[12px] text-v2-text-text-faint">{props.node.description}</p>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-[12px] text-v2-text-text-faint">
          <span>{language.t("agents.editor.model")}</span>
          <span>{language.t("agents.editor.model.hint")}</span>
        </div>
        <Show when={props.locked.model}>
          <p data-slot="agents-warning" class="rounded-xl px-3 py-2 text-[12px]">
            {language.t("agents.editor.fromFile")}
          </p>
        </Show>
        <div role="radiogroup" aria-label={language.t("agents.editor.model")} class="flex flex-col gap-1.5">
          <For each={groups()}>
            {(group) => (
              <>
                <span class="mt-1 text-[11px] uppercase tracking-wide text-v2-text-text-faint">{group.name}</span>
                <For each={group.models}>
                  {(model) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedRef() === model.ref}
                      data-slot="agents-option"
                      data-selected={selectedRef() === model.ref}
                      disabled={draft.inherit || props.locked.model}
                      class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-mono text-[13px]"
                      onClick={() =>
                        setDraft(
                          selectModel({ ...draft }, { providerID: group.id, modelID: model.id }, props.providers),
                        )
                      }
                    >
                      <span data-slot="agents-radio" />
                      <span class="min-w-0 truncate">{model.id}</span>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-[12px] text-v2-text-text-faint">
          <span>{language.t("agents.editor.effort")}</span>
          <span>{language.t("agents.editor.effort.hint")}</span>
        </div>
        <Show
          when={variants().length > 0 && !draft.inherit}
          fallback={
            <p data-slot="agents-chip" class="rounded-xl px-3 py-2 text-[12px] text-v2-text-text-faint">
              {language.t("agents.editor.effort.unavailable")}
            </p>
          }
        >
          <Show when={props.locked.variant}>
            <p data-slot="agents-warning" class="rounded-xl px-3 py-2 text-[12px]">
              {language.t("agents.editor.fromFile")}
            </p>
          </Show>
          <Show
            when={effortControl(theme.themeId()) === "segmented"}
            fallback={
              <div role="radiogroup" aria-label={language.t("agents.editor.effort")} class="flex flex-wrap gap-1.5">
                <For each={variants()}>
                  {(variant) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.variant === variant}
                      data-slot="agents-option"
                      data-selected={draft.variant === variant}
                      disabled={props.locked.variant}
                      class="rounded-xl px-3 py-1.5 text-[13px]"
                      onClick={() => setDraft("variant", draft.variant === variant ? undefined : variant)}
                    >
                      {variant}
                    </button>
                  )}
                </For>
              </div>
            }
          >
            <SegmentedControlV2
              class="segmented-control-v2--full-width"
              aria-label={language.t("agents.editor.effort")}
              value={draft.variant ?? null}
              allowDeselect
              disabled={props.locked.variant}
              onChange={(next) => setDraft("variant", next ?? undefined)}
            >
              <For each={variants()}>
                {(variant) => <SegmentedControlItemV2 value={variant}>{variant}</SegmentedControlItemV2>}
              </For>
            </SegmentedControlV2>
          </Show>
        </Show>
      </div>

      <Show when={canInherit()}>
        <Switch
          checked={draft.inherit}
          onChange={(checked) => setDraft("inherit", checked)}
          class="flex items-center justify-between rounded-xl px-3 py-2"
          data-slot="agents-chip"
        >
          {language.t("agents.editor.inherit")}
        </Switch>
      </Show>

      <Show when={state.confirming}>
        <p data-slot="agents-warning" role="alert" class="rounded-xl px-3 py-2 text-[12px]">
          {language.t("agents.editor.running")}
        </p>
      </Show>

      <div class="flex gap-2">
        <ButtonV2 variant="outline" class="flex-1" disabled={state.saving} onClick={props.onClose}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2 variant="contrast" class="flex-1" disabled={state.saving || !canSave(props.locked)} onClick={save}>
          {state.confirming ? language.t("agents.editor.apply") : language.t("common.save")}
        </ButtonV2>
      </div>
    </section>
  )
}
