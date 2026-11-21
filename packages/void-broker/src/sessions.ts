import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const shape = z.record(z.string(), z.string())

export type SessionStore = {
  get: (workerId: string) => string | undefined
  set: (workerId: string, sessionId: string) => Promise<void>
  delete: (workerId: string) => Promise<void>
}

export async function openSessions(file: string): Promise<SessionStore> {
  let data: Record<string, string> = {}
  try {
    data = shape.parse(JSON.parse(await readFile(file, "utf8")))
  } catch {
    data = {}
  }
  let writing: Promise<void> = Promise.resolve()
  const save = () => {
    writing = writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
        const temp = `${file}.${process.pid}.tmp`
        await writeFile(temp, JSON.stringify(data, null, 1) + "\n", { mode: 0o600 })
        await rename(temp, file)
      })
    return writing
  }
  return {
    get: (workerId) => data[workerId],
    async set(workerId, sessionId) {
      if (data[workerId] === sessionId) return
      data = { ...data, [workerId]: sessionId }
      await save()
    },
    async delete(workerId) {
      if (!(workerId in data)) return
      data = Object.fromEntries(Object.entries(data).filter(([key]) => key !== workerId))
      await save()
    },
  }
}
