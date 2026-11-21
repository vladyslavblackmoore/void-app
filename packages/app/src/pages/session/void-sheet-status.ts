import { createMemo } from "solid-js"
import { usePermission } from "@/context/permission"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import { sheetStatus } from "@/pages/session/void-sheet-model"

export function createSheetStatus(sessionID: () => string | undefined) {
  const sdk = useSDK()
  const sync = useSync()
  const permission = usePermission()
  const waiting = createMemo(
    () =>
      !!sessionPermissionRequest(
        sync().data.session,
        sync().data.permission,
        sessionID(),
        (item) => !permission.autoResponds(item, sdk().directory),
      ) || !!sessionQuestionRequest(sync().data.session, sync().data.question, sessionID()),
  )
  const working = createMemo(() => sync().data.session_working(sessionID() ?? ""))
  const status = createMemo(() => sheetStatus({ waiting: waiting(), working: working() }))
  return { waiting, status }
}
