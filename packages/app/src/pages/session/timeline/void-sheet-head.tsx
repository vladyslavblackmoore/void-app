import { createMemo, For, Show } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { useSDK } from "@/context/sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import { sheetStatus, sheetTabs, type SheetView } from "@/pages/session/void-sheet-model"

export function VoidSheetDot(props: { sessionID: string | undefined }) {
  const sdk = useSDK()
  const sync = useSync()
  const permission = usePermission()
  const waiting = createMemo(
    () =>
      !!sessionPermissionRequest(
        sync().data.session,
        sync().data.permission,
        props.sessionID,
        (item) => !permission.autoResponds(item, sdk().directory),
      ) || !!sessionQuestionRequest(sync().data.session, sync().data.question, props.sessionID),
  )
  const working = createMemo(() => sync().data.session_working(props.sessionID ?? ""))
  const status = createMemo(() => sheetStatus({ waiting: waiting(), working: working() }))

  return (
    <span data-slot="void-sheet-dot" data-state={status()}>
      <StatusDotV2 status={status()} glow={status() !== "idle"} size="large" />
    </span>
  )
}

export function VoidSheetTabs(props: { view: SheetView; onChange: (view: SheetView) => void }) {
  const language = useLanguage()

  return (
    <div data-slot="void-sheet-tabs" role="radiogroup" aria-label={language.t("void.sheet.tabs")}>
      <For each={sheetTabs({ void: true })}>
        {(tab) => (
          <button
            type="button"
            role="radio"
            data-slot="void-sheet-tab"
            data-active={props.view === tab ? "true" : undefined}
            aria-checked={props.view === tab}
            onClick={() => props.onChange(tab)}
          >
            {language.t(tab === "chat" ? "void.sheet.tab.chat" : "void.sheet.tab.tasks")}
          </button>
        )}
      </For>
    </div>
  )
}

export function VoidSheetTasks(props: { sessionID: string | undefined }) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const todos = createMemo(() => (props.sessionID ? (serverSync().session.data.todo[props.sessionID] ?? []) : []))
  const tone = (state: string) => (state === "completed" ? "green" : state === "in_progress" ? "yellow" : "grey")

  return (
    <div data-slot="void-sheet-tasks">
      <Show
        when={todos().length > 0}
        fallback={<div data-slot="void-sheet-tasks-empty">{language.t("void.sheet.tasks.empty")}</div>}
      >
        <For each={todos()}>
          {(todo) => (
            <div data-slot="void-sheet-task" data-state={todo.status}>
              <StatusDotV2 tone={tone(todo.status)} />
              <span>{todo.content}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
