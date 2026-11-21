type WriteLog = (scope: "main", message: string, data: { userInitiated: boolean }) => void

export function createQuitOrigin() {
  let userInitiated = false
  let logged = false
  return {
    markUserQuit() {
      userInitiated = true
    },
    clearUserQuit() {
      userInitiated = false
    },
    logQuit(writeLog: WriteLog) {
      if (logged) return
      logged = true
      writeLog("main", "app quitting", { userInitiated })
    },
  }
}

export const quitOrigin = createQuitOrigin()
