import { StatusDotV2 } from "@opencode-ai/ui/v2/status-dot-v2"
import { todoTone } from "./void-sheet-model"

export function VoidTodoRow(props: { status: string; content: string }) {
  return (
    <div data-slot="void-todo" data-state={props.status}>
      <StatusDotV2 tone={todoTone(props.status)} />
      <span>{props.content}</span>
    </div>
  )
}
