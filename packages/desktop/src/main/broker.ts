import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CoreStart } from "./cores"
import { coreEnv } from "./void-home"
import { spaceDir } from "./spaces"
import type { BrokerStatusStore } from "./broker-status"

const READY_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 8_000

export function brokerSocketPath(root: string, id: string, platform: NodeJS.Platform = process.platform, tmp = tmpdir()) {
  const preferred = join(spaceDir(root, id), "state", "broker", "broker.sock")
  if (platform === "win32") return preferred
  const limit = platform === "darwin" ? 104 : 108
  const fits = (path: string) => Buffer.byteLength(path) < limit
  if (fits(preferred)) return preferred
  const name = `void-broker-${createHash("sha256").update(`${root}\0${id}`).digest("hex").slice(0, 8)}.sock`
  const fallback = join(tmp, name)
  return fits(fallback) ? fallback : join("/tmp", name)
}

export function brokerPaths(root: string, id: string) {
  const space = spaceDir(root, id)
  const stateDir = join(space, "state", "broker")
  return {
    config: join(space, "config", "broker", "workers.json"),
    stateDir,
    socket: brokerSocketPath(root, id),
    memoryDb: join(space, "data", "memory", "graph.db"),
    spaceConfig: join(space, "config", "opencode"),
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
  onSpawn?: () => void
  onExit?: (code: number | null) => void
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
    VOID_BROKER_SPACE_CONFIG: paths.spaceConfig,
    VOID_BROKER_SOCKET: paths.socket,
  })
  const child = spawn(deps.runtime.command, [deps.runtime.entry], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  })
  deps.onSpawn?.()
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
    deps.onExit?.(code)
  })
  return { socket: paths.socket, stop }
}

export type WithBrokerDeps = {
  root: string
  runtime: BrokerRuntime
  warn: (message: string, error?: unknown) => void
  status?: BrokerStatusStore
  readyTimeoutMs?: number
  stopTimeoutMs?: number
}

export function withBroker(start: CoreStart, deps: WithBrokerDeps): CoreStart {
  const stopping = new Map<string, Promise<void>>()
  return async (id, options) => {
    await stopping.get(id)
    const socket = brokerPaths(deps.root, id).socket
    let stopped: Promise<void> | undefined
    const broker = await startBroker({
      root: deps.root,
      id,
      runtime: deps.runtime,
      env: options.env,
      readyTimeoutMs: deps.readyTimeoutMs,
      stopTimeoutMs: deps.stopTimeoutMs,
      onSpawn: () => deps.status?.set({ space: id, state: "starting" }),
      onExit: (exitCode) => {
        if (!stopped) deps.status?.set({ space: id, state: "failed", exitCode })
      },
    }).catch((error) => {
      deps.warn("failed to start the broker", error)
      deps.status?.set({ space: id, state: "failed" })
      return undefined
    })
    if (broker) deps.status?.set({ space: id, state: "running" })
    const stopBroker = () => {
      if (!broker) return Promise.resolve()
      if (!stopped) {
        const current = broker.stop().catch((error) => deps.warn("failed to stop the broker", error))
        stopped = current
        stopping.set(id, current)
        void current.then(() => {
          if (stopping.get(id) === current) stopping.delete(id)
          deps.status?.set({ space: id, state: "stopped" })
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
