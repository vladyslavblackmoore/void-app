import { createMemo, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { createSheetStatus } from "./void-sheet-status"
import { runSummary } from "./void-run-model"
import { VoidRunView } from "./void-run-view"
import "./void-session-sheets.css"

export function VoidRunDetails(props: { diffs: () => { file?: string }[] }) {
  const language = useLanguage()
  const params = useParams<{ id?: string }>()
  const sdk = useSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const providers = useProviders(() => sdk().directory)

  const messages = createMemo(() => (params.id ? (sync().data.message[params.id] ?? []) : []))
  const todos = createMemo(() => (params.id ? (serverSync().session.data.todo[params.id] ?? []) : []))
  const { waiting, status } = createSheetStatus(() => params.id)
  const files = createMemo(() => props.diffs().flatMap((diff) => (diff.file ? [diff.file] : [])))
  const summary = createMemo(() =>
    runSummary({
      id: params.id,
      messages: messages(),
      providers: [...providers.all().values()],
      todos: todos().length,
      files: files().length,
    }),
  )

  return (
    <aside data-component="void-run-details" aria-label={language.t("void.run.title")}>
      <div data-slot="void-sheet-head">
        <StatusDotV2 status={status()} glow={status() !== "idle"} size="large" />
        <span data-slot="void-sheet-title">{language.t("void.run.title")}</span>
      </div>
      <div data-slot="void-sheet-scroll">
        <VoidRunView
          t={(key, params) => language.t(key as Parameters<typeof language.t>[0], params)}
          intl={language.intl()}
          id={params.id}
          status={status()}
          context={summary().context}
          model={summary().model}
          todos={todos()}
          files={files()}
          empty={summary().empty}
        />
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
