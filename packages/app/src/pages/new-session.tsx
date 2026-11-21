import { createPromptProjectController } from "@/components/prompt-project-selector"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useSettings } from "@/context/settings"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, createResource, Show } from "solid-js"
import { useVoidTheme } from "@/components/void/use-void-theme"
import { VoidRunDetails } from "@/pages/session/void-run-details"
import { VoidSessionList } from "@/pages/session/void-session-list"
import { createNewSessionDraftController } from "./new-session/new-session-draft-controller"
import { newSessionSheets } from "./new-session/new-session-sheets"
import { NewSessionStatus, NewSessionView } from "./new-session/new-session-view"
import { createNewSessionWorkspaceController } from "./new-session/new-session-workspace-controller"
import { useNewSessionCommands } from "./new-session/use-new-session-commands"

/** The draft-only V2 session page. Submitting promotes the draft into a real session. */
export default function NewSessionPage() {
  const settings = useSettings()
  const voidTheme = useVoidTheme()
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const sheets = createMemo(() => newSessionSheets({ void: voidTheme(), desktop: isDesktop() }))
  const rightMount = useTitlebarRightMount()
  const workspace = createNewSessionWorkspaceController()
  const draft = createNewSessionDraftController({
    worktree: workspace.selection.value,
    resetWorktree: workspace.selection.reset,
  })
  const project = createPromptProjectController({
    controls: draft.project.controls,
    onDone: draft.input.restoreFocus,
  })
  useNewSessionCommands({
    restoreFocus: draft.input.restoreFocus,
    project: {
      empty: project.empty,
      open: () => project.setOpen(true),
    },
  })
  createEffect(() => {
    if (!draft.prompt.ready()) return
    draft.input.restoreFocus()
  })
  const ready = Promise.resolve()
  const [suspendUntilPromptReady] = createResource(
    () => draft.prompt.readyPromise() ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
      <NewSessionStatus mount={rightMount} visible={settings.visibility.status} />
      <Show
        when={sheets()}
        fallback={
          <div class="flex-1 min-h-0 flex flex-col gap-2 p-2">
            <NewSessionView input={draft.input} project={project} workspace={workspace} />
          </div>
        }
      >
        <div data-void-sheets class="flex-1 min-h-0 flex flex-row">
          <VoidSessionList />
          <div data-slot="void-session-main" class="relative flex min-h-0 flex-col">
            <NewSessionView input={draft.input} project={project} workspace={workspace} />
          </div>
          <VoidRunDetails diffs={() => []} />
        </div>
      </Show>
    </div>
  )
}
