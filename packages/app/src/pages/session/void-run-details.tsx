import { createMemo, For, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { getSessionContext } from "@/components/session/session-context-metrics"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import "./void-session-sheets.css"

const FILE_LIMIT = 8

export function VoidRunDetails(props: { diffs: () => { file?: string }[] }) {
  const language = useLanguage()
  const params = useParams<{ id?: string }>()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const permission = usePermission()
  const providers = useProviders(() => sdk().directory)

  const messages = createMemo(() => (params.id ? (sync().data.message[params.id] ?? []) : []))
  const context = createMemo(() => getSessionContext(messages(), [...providers.all().values()]))
  const todos = createMemo(() => (params.id ? (serverSync().session.data.todo[params.id] ?? []) : []))
  const waiting = createMemo(
    () =>
      !!sessionPermissionRequest(
        sync().data.session,
        sync().data.permission,
        params.id,
        (item) => !permission.autoResponds(item, sdk().directory),
      ) || !!sessionQuestionRequest(sync().data.session, sync().data.question, params.id),
  )
  const working = createMemo(() => sync().data.session_working(params.id ?? ""))
  const status = createMemo(() => (waiting() ? "waiting" : working() ? "running" : "idle"))
  const files = createMemo(() => props.diffs().flatMap((diff) => (diff.file ? [diff.file] : [])))
  const compact = createMemo(() => new Intl.NumberFormat(language.intl(), { notation: "compact" }))
  const todoTone = (state: string) => (state === "completed" ? "green" : state === "in_progress" ? "yellow" : "grey")

  return (
    <aside data-component="void-run-details" aria-label={language.t("void.run.title")}>
      <div data-slot="void-sheet-head">
        <StatusDotV2 status={status()} glow={status() !== "idle"} size="large" />
        <span data-slot="void-sheet-title">{language.t("void.run.title")}</span>
      </div>
      <div data-slot="void-sheet-scroll">
        <Show when={context()}>
          {(value) => (
            <section>
              <div data-slot="void-run-context">
                <span>{language.t("void.run.context")}</span>
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
        <Show when={todos().length > 0}>
          <section>
            <div data-slot="void-sheet-eyebrow">{language.t("void.run.plan")}</div>
            <For each={todos()}>
              {(todo) => (
                <div data-slot="void-run-todo" data-state={todo.status}>
                  <StatusDotV2 tone={todoTone(todo.status)} />
                  <span>{todo.content}</span>
                </div>
              )}
            </For>
          </section>
        </Show>
        <Show when={files().length > 0}>
          <section>
            <div data-slot="void-sheet-eyebrow">{language.t("void.run.files")}</div>
            <div data-slot="void-run-files">
              <For each={files().slice(0, FILE_LIMIT)}>{(file) => <code>{file}</code>}</For>
              <Show when={files().length > FILE_LIMIT}>
                <span data-slot="void-run-more">
                  {language.t("void.run.filesMore", { count: String(files().length - FILE_LIMIT) })}
                </span>
              </Show>
            </div>
          </section>
        </Show>
        <Show when={!context() && todos().length === 0 && files().length === 0}>
          <div data-slot="void-sheet-empty">{language.t("void.run.empty")}</div>
        </Show>
      </div>
      <Show when={waiting()}>
        <div data-slot="void-run-note">
          <StatusDotV2 tone="yellow" />
          {language.t("void.run.waiting")}
        </div>
      </Show>
    </aside>
  )
}
