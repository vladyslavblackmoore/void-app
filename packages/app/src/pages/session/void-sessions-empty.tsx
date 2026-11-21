import { Show } from "solid-js"

export function VoidSessionsEmpty(props: {
  title: string
  text: string
  action?: { label: string; disabled: boolean; run: () => void }
}) {
  return (
    <div data-slot="void-empty">
      <span data-slot="void-empty-icon" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2.5 4.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11a1.5 1.5 0 0 1-1.5-1.5z" />
        </svg>
      </span>
      <span data-slot="void-empty-title">{props.title}</span>
      <span data-slot="void-empty-text">{props.text}</span>
      <Show when={props.action}>
        {(action) => (
          <button type="button" data-slot="void-empty-action" disabled={action().disabled} onClick={action().run}>
            {action().label}
          </button>
        )}
      </Show>
    </div>
  )
}
