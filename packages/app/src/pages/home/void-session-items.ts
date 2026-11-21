import { createMemo } from "solid-js"
import { usePermission } from "@/context/permission"
import { sessionPermissionRequest, sessionQuestionRequest } from "@/pages/session/composer/session-request-tree"
import type { HomeController } from "./home-controller"
import type { HomeSessionsController } from "./home-sessions-controller"

export function createVoidSessionItems(home: HomeController, sessions: HomeSessionsController) {
  const permission = usePermission()
  return createMemo(() => {
    const sync = home.server.focusedSync()
    const state = permission.ensureServerState(sessions.session.server())
    const known = Object.values(sync.session.data.info).filter((session) => !!session)
    return sessions.data.records().map((record) => {
      const directory = record.session.directory
      const tree = [...known, ...sync.child(directory, { bootstrap: false })[0].session]
      const pending = sessionPermissionRequest(tree, sync.session.data.permission, record.session.id, (request) => {
        return !state.autoResponds(request, directory)
      })
      const question = sessionQuestionRequest(tree, sync.session.data.question, record.session.id)
      return {
        id: record.session.id,
        record,
        pending,
        question,
        waiting: !!pending || !!question,
        working: sync.session.data.session_working(record.session.id),
      }
    })
  })
}
