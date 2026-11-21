import { useLanguage } from "@/context/language"

export function VoidTitlebarActions(props: { onSearch: () => void; onNewTask: () => void }) {
  const language = useLanguage()

  return (
    <div data-component="void-titlebar-actions">
      <button
        type="button"
        data-slot="void-iconbtn"
        aria-label={language.t("void.titlebar.search")}
        onClick={props.onSearch}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.8" />
          <path d="M10.6 10.6L14 14" />
        </svg>
      </button>
      <button type="button" data-slot="void-iconbtn" aria-label={language.t("void.titlebar.notifications")} disabled>
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 11V7.2a4.5 4.5 0 019 0V11l1 1.3h-11z" />
          <path d="M6.5 14h3" />
        </svg>
      </button>
      <button
        type="button"
        data-slot="void-new-task"
        aria-label={language.t("void.titlebar.newTask")}
        onClick={props.onNewTask}
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
          <path d="M8 3v10M3 8h10" />
        </svg>
        <span data-slot="void-new-task-label">{language.t("void.titlebar.newTask")}</span>
      </button>
    </div>
  )
}
