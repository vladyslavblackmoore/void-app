import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { CoreStart } from "./cores"
import { coreEnv } from "./void-home"
import { spaceDir } from "./spaces"

const READY_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 8_000

export function brokerPaths(root: string, id: string) {
  const space = spaceDir(root, id)
  const stateDir = join(space, "state", "broker")
  return {
    config: join(space, "config", "broker", "workers.json"),
    stateDir,
    socket: join(stateDir, "broker.sock"),
    memoryDb: join(space, "data", "memory", "graph.db"),
  }
}

export type BrokerRuntime = { command: string; entry: string; env: Record<string, string> }

export function brokerRuntime(input: {
  packaged: boolean
  execPath: string
  resourcesPath: string
  devEntry: string
  env: Record<string, string | undefined>
}): BrokerRuntime {
  if (input.packaged) {
    const dir = join(input.resourcesPath, "broker")
    return {
      command: input.execPath,
      entry: join(dir, "broker.mjs"),
      env: { ELECTRON_RUN_AS_NODE: "1", VOID_BROKER_SHIM: join(dir, "shim.mjs") },
    }
  }
  return { command: input.env["VOID_BROKER_RUNTIME"] || "bun", entry: input.devEntry, env: {} }
}

export type BrokerDeps = {
  root: string
  id: string
  runtime: BrokerRuntime
  env: Record<string, string>
  readyTimeoutMs?: number
  stopTimeoutMs?: number
}

export type RunningBroker = { socket: string; stop: () => Promise<void> }

const groupKill = (child: ChildProcess) => {
  if (child.pid === undefined) return
  try {
    if (process.platform === "win32") child.kill("SIGKILL")
    else process.kill(-child.pid, "SIGKILL")
  } catch {}
}

export async function startBroker(deps: BrokerDeps): Promise<RunningBroker | undefined> {
  const paths = brokerPaths(deps.root, deps.id)
  if (!existsSync(paths.config) || !existsSync(deps.runtime.entry)) return undefined
  const env = coreEnv(process.env, {
    ...deps.env,
    ...deps.runtime.env,
    VOID_SPACE_ID: deps.id,
    VOID_BROKER_CONFIG: paths.config,
    VOID_BROKER_STATE_DIR: paths.stateDir,
    VOID_BROKER_MEMORY_DB: paths.memoryDb,
    VOID_BROKER_SOCKET: paths.socket,
  })
  const child = spawn(deps.runtime.command, [deps.runtime.entry], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  })
  let gone = false
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => {
      gone = true
      resolve(code)
    })
    child.once("error", () => {
      gone = true
      resolve(null)
    })
  })
  child.stderr?.resume()
  let output = ""
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("broker did not become ready")), deps.readyTimeoutMs ?? READY_TIMEOUT_MS)
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes("ready")) {
        clearTimeout(timer)
        resolve()
      }
    })
    void exited.then((code) => {
      clearTimeout(timer)
      reject(new Error(`broker exited before ready with code ${code}`))
    })
  })
  let stopping: Promise<void> | undefined
  const stop = () => {
    stopping ??= (async () => {
      if (!gone) child.stdin?.end()
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), deps.stopTimeoutMs ?? STOP_TIMEOUT_MS)
      })
      const outcome = await Promise.race([exited, timedOut])
      clearTimeout(timer)
      if (outcome === "timeout" || outcome !== 0) groupKill(child)
      if (outcome === "timeout") await exited
    })()
    return stopping
  }
  try {
    await ready
  } catch (error) {
    await stop()
    throw error
  }
  void exited.then((code) => {
    if (code !== 0) groupKill(child)
  })
  return { socket: paths.socket, stop }
}

export type WithBrokerDeps = {
  root: string
  runtime: BrokerRuntime
  warn: (message: string, error?: unknown) => void
  readyTimeoutMs?: number
  stopTimeoutMs?: number
}

export function withBroker(start: CoreStart, deps: WithBrokerDeps): CoreStart {
  const stopping = new Map<string, Promise<void>>()
  return async (id, options) => {
    await stopping.get(id)
    const socket = brokerPaths(deps.root, id).socket
    const broker = await startBroker({
      root: deps.root,
      id,
      runtime: deps.runtime,
      env: options.env,
      readyTimeoutMs: deps.readyTimeoutMs,
      stopTimeoutMs: deps.stopTimeoutMs,
    }).catch((error) => {
      deps.warn("failed to start the broker", error)
      return undefined
    })
    let stopped: Promise<void> | undefined
    const stopBroker = () => {
      if (!broker) return Promise.resolve()
      if (!stopped) {
        const current = broker.stop().catch((error) => deps.warn("failed to stop the broker", error))
        stopped = current
        stopping.set(id, current)
        void current.then(() => {
          if (stopping.get(id) === current) stopping.delete(id)
        })
      }
      return stopped
    }
    try {
      const handle = await start(id, {
        ...options,
        env: { ...options.env, VOID_SPACE_ID: id, VOID_BROKER_SOCKET: socket },
      })
      void handle.exited?.then(stopBroker, stopBroker)
      return {
        ...handle,
        stop: async () => {
          try {
            await handle.stop()
          } finally {
            await stopBroker()
          }
        },
      }
    } catch (error) {
      await stopBroker()
      throw error
    }
  }
}
