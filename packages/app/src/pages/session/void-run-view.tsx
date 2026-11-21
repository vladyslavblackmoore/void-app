import { For, Show } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import type { RunStatus } from "./void-run-model"

const FILE_LIMIT = 8
const todoTone = (state: string) => (state === "completed" ? "green" : state === "in_progress" ? "yellow" : "grey")

export type RunViewProps = {
  t: (key: string, params?: Record<string, string>) => string
  intl: string
  id: string | undefined
  status: RunStatus
  context: { total: number; limit: number | undefined; usage: number | null } | undefined
  model: string | undefined
  todos: { status: string; content: string }[]
  files: string[]
  empty: boolean
}

export function VoidRunView(props: RunViewProps) {
  const compact = () => new Intl.NumberFormat(props.intl, { notation: "compact" })
  return (
    <>
      <Show when={props.id}>
        <section data-slot="void-run-status">
          <div data-slot="void-run-context">
            <span>{props.t("void.run.status")}</span>
            <span data-slot="void-run-context-value">{props.t(`void.run.status.${props.status}`)}</span>
          </div>
          <Show when={props.model}>
            {(model) => (
              <div data-slot="void-run-context">
                <span>{props.t("void.run.model")}</span>
                <span data-slot="void-run-context-value">{model()}</span>
              </div>
            )}
          </Show>
        </section>
      </Show>
      <Show when={props.context}>
        {(value) => (
          <section>
            <div data-slot="void-run-context">
              <span>{props.t("void.run.context")}</span>
              <span data-slot="void-run-context-value">
                {compact().format(value().total)}
                <Show when={value().limit}>{(limit) => <> / {compact().format(limit())}</>}</Show>
              </span>
            </div>
            <Show when={value().usage !== null}>
              <div
                data-slot="void-run-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value().usage ?? 0}
              >
                <i style={{ width: `${Math.min(100, value().usage ?? 0)}%` }} />
              </div>
            </Show>
          </section>
        )}
      </Show>
      <Show when={props.todos.length > 0}>
        <section>
          <div data-slot="void-sheet-eyebrow">{props.t("void.run.plan")}</div>
          <For each={props.todos}>
            {(todo) => (
              <div data-slot="void-run-todo" data-state={todo.status}>
                <StatusDotV2 tone={todoTone(todo.status)} />
                <span>{todo.content}</span>
              </div>
            )}
          </For>
        </section>
      </Show>
      <Show when={props.files.length > 0}>
        <section>
          <div data-slot="void-sheet-eyebrow">{props.t("void.run.files")}</div>
          <div data-slot="void-run-files">
            <For each={props.files.slice(0, FILE_LIMIT)}>{(file) => <code>{file}</code>}</For>
            <Show when={props.files.length > FILE_LIMIT}>
              <span data-slot="void-run-more">
                {props.t("void.run.filesMore", { count: String(props.files.length - FILE_LIMIT) })}
              </span>
            </Show>
          </div>
        </section>
      </Show>
      <Show when={props.empty}>
        <div data-slot="void-sheet-empty">{props.t("void.run.empty")}</div>
      </Show>
    </>
  )
}
