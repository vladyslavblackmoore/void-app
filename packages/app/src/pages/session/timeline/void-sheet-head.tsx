import { createMemo, For, Show } from "solid-js"
import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { sheetTabs, type SheetView } from "@/pages/session/void-sheet-model"
import { createSheetStatus } from "@/pages/session/void-sheet-status"
import { VoidTodoRow } from "@/pages/session/void-todo-row"

export function VoidSheetDot(props: { sessionID: string | undefined }) {
  const { status } = createSheetStatus(() => props.sessionID)

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

  return (
    <div data-slot="void-sheet-tasks">
      <Show
        when={todos().length > 0}
        fallback={<div data-slot="void-sheet-tasks-empty">{language.t("void.sheet.tasks.empty")}</div>}
      >
        <For each={todos()}>
          {(todo) => <VoidTodoRow status={todo.status} content={todo.content} />}
        </For>
      </Show>
    </div>
  )
}
