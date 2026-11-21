import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createLinkFactory } from "./links"
import { startServer } from "./server"
import type { WorkerLink } from "./types"
import { loadWorkers, type WorkerEntry } from "./workers"

const need = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const unsupported = (entry: WorkerEntry): WorkerLink => {
  const fail = () => Promise.reject(new Error(`backend not supported: ${entry.backend}`))
  return {
    start: fail,
    async *prompt() {
      throw new Error(`backend not supported: ${entry.backend}`)
    },
    cancel: () => Promise.resolve(),
    setOption: () => Promise.resolve(),
    close: () => Promise.resolve(),
    health: () => Promise.resolve({ ok: false, detail: `backend not supported: ${entry.backend}` }),
  }
}

export async function runBroker(env: Record<string, string | undefined>) {
  const config = await loadWorkers(need(env, "VOID_BROKER_CONFIG"))
  const stateDir = need(env, "VOID_BROKER_STATE_DIR")
  const memoryDb = need(env, "VOID_BROKER_MEMORY_DB")
  await mkdir(path.dirname(memoryDb), { recursive: true })
  return startServer({
    config,
    stateDir,
    createLink: createLinkFactory({
      stateDir,
      cwd: env["VOID_BROKER_CWD"] || process.cwd(),
      memoryDb,
      spaceConfigDir: env["VOID_BROKER_SPACE_CONFIG"],
      fallback: unsupported,
    }),
  })
}
