import { createEffect, createSignal, For, Match, on, Show, Switch as SolidSwitch } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import {
  authorizeMode,
  canAdvance,
  flowSteps,
  initialStep,
  isPlaceholder,
  nextStep,
  prevStep,
  stepStatus,
  type FlowStep,
} from "./connect-flow-model"
import type { ConnectorTile } from "./connector-model"

const check = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
)

export function ConnectPanel(props: { tile: ConnectorTile; busy: boolean; onToggle: () => void; onClose: () => void }) {
  const language = useLanguage()
  const [step, setStep] = createSignal<FlowStep>(initialStep(props.tile.state))
  const authorized = () => props.tile.state === "connected"
  const mode = () => authorizeMode(props.tile.state)
  const name = () => props.tile.name

  createEffect(
    on(authorized, (value, previous) => {
      if (value && previous === false && step() === "authorize") setStep("account")
    }),
  )

  const actionLabel = () => {
    if (mode() === "authorize") return language.t("hub.panel.authorize.button")
    if (mode() === "ready") return language.t("hub.panel.ready.disconnect")
    if (props.tile.state === "error") return language.t("hub.panel.connect.retry")
    return language.t("hub.panel.connect.button")
  }

  return (
    <aside data-component="void-connect-panel" aria-label={language.t("hub.panel.title", { name: name() })}>
      <div data-slot="void-panel-head">
        <div data-slot="void-connector-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 2v3M10 2v3M4.5 5h7v2.5a3.5 3.5 0 01-7 0zM8 11v3" />
          </svg>
        </div>
        <div data-slot="void-panel-heading">
          <h2 data-slot="void-panel-title">{language.t("hub.panel.title", { name: name() })}</h2>
          <div data-slot="void-panel-meta">
            <StatusDotV2 tone={props.tile.tone} />
            {language.t(`hub.state.${props.tile.state}`)}
          </div>
        </div>
        <button
          type="button"
          data-slot="void-panel-close"
          aria-label={language.t("hub.panel.close")}
          onClick={props.onClose}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <ol data-slot="void-stepper" aria-label={language.t("hub.panel.steps.label")}>
        <For each={flowSteps}>
          {(item, index) => (
            <>
              <Show when={index() > 0}>
                <li data-slot="void-step-line" aria-hidden="true" />
              </Show>
              <li
                data-slot="void-step"
                data-status={stepStatus(step(), item)}
                aria-current={step() === item ? "step" : undefined}
              >
                <i>{stepStatus(step(), item) === "done" ? check : index() + 1}</i>
                {language.t(`hub.panel.step.${item}`)}
              </li>
            </>
          )}
        </For>
      </ol>
      <div data-slot="void-panel-card" data-step={step()}>
        <SolidSwitch>
          <Match when={step() === "authorize"}>
            <div data-slot="void-panel-card-title">{language.t(`hub.panel.${mode()}.title`, { name: name() })}</div>
            <div data-slot="void-panel-card-text">
              {language.t(`hub.panel.${mode()}.description`, { name: name() })}
            </div>
            <Show when={props.tile.state === "error" && props.tile.error}>
              <div data-slot="void-panel-error">{props.tile.error}</div>
            </Show>
            <Show when={mode() !== "unavailable"}>
              <button type="button" data-slot="void-panel-action" disabled={props.busy} onClick={props.onToggle}>
                {actionLabel()}
              </button>
            </Show>
          </Match>
          <Match when={step() === "account"}>
            <div data-slot="void-panel-card-title">{language.t("hub.panel.account.title")}</div>
            <div data-slot="void-panel-card-text">{language.t("hub.panel.account.description")}</div>
          </Match>
          <Match when={step() === "access"}>
            <div data-slot="void-panel-card-title">{language.t("hub.panel.access.title")}</div>
            <div data-slot="void-panel-card-text">{language.t("hub.panel.access.description")}</div>
            <Show
              when={props.tile.services.length > 0}
              fallback={<div data-slot="void-panel-card-text">{language.t("hub.panel.access.none")}</div>}
            >
              <For each={props.tile.services}>
                {(service) => (
                  <div data-slot="void-panel-row" data-disabled="true">
                    <div data-slot="void-panel-row-text">
                      <div>{language.t("hub.panel.access.row", { service })}</div>
                      <div data-slot="void-panel-row-desc">{language.t("hub.panel.access.pending")}</div>
                    </div>
                    <Switch checked={false} disabled hideLabel>
                      {service}
                    </Switch>
                  </div>
                )}
              </For>
            </Show>
          </Match>
          <Match when={step() === "done"}>
            <div data-slot="void-panel-done">
              <span data-slot="void-panel-done-mark">{check}</span>
              <div>
                <div data-slot="void-panel-card-title">{language.t("hub.panel.done.title", { name: name() })}</div>
                <div data-slot="void-panel-card-text">{language.t("hub.panel.done.description")}</div>
              </div>
            </div>
          </Match>
        </SolidSwitch>
      </div>
      <Show when={isPlaceholder(step())}>
        <div data-slot="void-panel-banner">
          <StatusDotV2 tone="yellow" />
          <span>{language.t("hub.panel.placeholder")}</span>
        </div>
      </Show>
      <div data-slot="void-panel-actions">
        <button
          type="button"
          data-slot="void-panel-back"
          disabled={step() === "authorize"}
          onClick={() => setStep(prevStep(step()))}
        >
          {language.t("hub.panel.back")}
        </button>
        <button
          type="button"
          data-slot="void-panel-next"
          disabled={step() !== "done" && !canAdvance(step(), { authorized: authorized() })}
          onClick={() =>
            step() === "done" ? props.onClose() : setStep(nextStep(step(), { authorized: authorized() }))
          }
        >
          {step() === "done" ? language.t("hub.panel.finish") : language.t("hub.panel.continue")}
        </button>
      </div>
    </aside>
  )
}
