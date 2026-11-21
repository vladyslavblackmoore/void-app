import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

export type RunRecord = {
  runId: string
  worker: string
  sessionId: string
  taskId: string | null
  queuedAt: number
  startedAt: number
  firstEventAt: number | null
  resultAt: number
  stopReason: string
  error: string | null
  stdinAt: number | null
  binaryFirstAt: number | null
}

export function openRunLog(dir: string) {
  const file = path.join(dir, "runs.jsonl")
  let writing: Promise<void> = Promise.resolve()
  return {
    file,
    append(record: RunRecord) {
      writing = writing
        .catch(() => undefined)
        .then(async () => {
          await mkdir(dir, { recursive: true, mode: 0o700 })
          await appendFile(file, JSON.stringify(record) + "\n", { mode: 0o600 })
        })
      return writing
    },
    flush: () => writing.catch(() => undefined),
  }
}
