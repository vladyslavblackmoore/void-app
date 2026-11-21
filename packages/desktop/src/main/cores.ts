import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { userXdg, voidAppEnv } from "./void-home"

export const IDLE_STOP_MS = 30 * 60 * 1000
export const IDLE_SWEEP_MS = 60 * 1000

const HOSTNAME = "127.0.0.1"
const USERNAME = "opencode"
const REQUEST_TIMEOUT_MS = 5000

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export type CoreEndpoint = { url: string; username: string; password: string }

export type CoreStartOptions = { hostname: string; port: number; password: string; env: Record<string, string> }
export type CoreStart = (id: string, options: CoreStartOptions) => Promise<{ stop: () => Promise<void>; ready?: Promise<void>; exited?: Promise<void> }>

export type CoresDeps = {
  root: string
  start: CoreStart
  prepare?: (id: string) => Promise<void>
  user?: () => Parameters<typeof voidAppEnv>[1]
  freePort?: () => Promise<number>
  password?: () => string
  fetch?: Fetch
  now?: () => number
  every?: (run: () => void, ms: number) => () => void
}

export function freeLoopbackPort() {
  return new Promise<number>((resolve, reject) => {
    const socket = createServer()
    socket.on("error", reject)
    socket.listen(0, HOSTNAME, () => {
      const address = socket.address()
      if (typeof address !== "object" || !address) {
        socket.close()
        reject(new Error("no port"))
        return
      }
      socket.close(() => resolve(address.port))
    })
  })
}

function authorization(password: string) {
  return { authorization: `Basic ${Buffer.from(`${USERNAME}:${password}`).toString("base64")}` }
}

async function getJson(fetcher: Fetch, core: CoreEndpoint, path: string) {
  const response = await fetcher(new URL(path, core.url), {
    headers: authorization(core.password),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${path} ${response.status}`)
  return response.json() as Promise<unknown>
}

export async function isCoreBusy(core: CoreEndpoint, fetcher: Fetch = fetch) {
  try {
    const projects = await getJson(fetcher, core, "/project")
    if (!Array.isArray(projects)) return true
    const directories = [
      ...new Set(
        projects.flatMap((project: { worktree?: unknown; sandboxes?: unknown }) => [
          ...(typeof project.worktree === "string" ? [project.worktree] : []),
          ...(Array.isArray(project.sandboxes) ? project.sandboxes.filter((item) => typeof item === "string") : []),
        ]),
      ),
    ]
    const results = await Promise.all(
      directories.map(async (directory) => {
        const status = await getJson(fetcher, core, `/session/status?directory=${encodeURIComponent(directory)}`)
        return !status || typeof status !== "object" || Object.keys(status).length > 0
      }),
    )
    return results.some(Boolean)
  } catch {
    return true
  }
}

type Running = { endpoint: CoreEndpoint; stop: () => Promise<void>; ready: Promise<void>; lastBusy: number }

export function createCores(deps: CoresDeps) {
  const fetcher = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  const freePort = deps.freePort ?? freeLoopbackPort
  const password = deps.password ?? randomUUID
  const user = deps.user ?? (() => userXdg(deps.root, process.env.VOID_USER_ENV))
  const every =
    deps.every ??
    ((run, ms) => {
      const timer = setInterval(run, ms)
      timer.unref()
      return () => clearInterval(timer)
    })

  const running = new Map<string, Running>()
  const starting = new Map<string, Promise<CoreEndpoint>>()
  let viewed: string | undefined
  let cancelSweep: (() => void) | undefined
  let sweeping: Promise<void> | undefined

  const drop = (id: string, entry: Running) => {
    if (running.get(id) !== entry) return
    running.delete(id)
    if (running.size === 0) {
      cancelSweep?.()
      cancelSweep = undefined
    }
  }

  const launch = async (id: string, port?: number) => {
    await deps.prepare?.(id)
    const options = {
      hostname: HOSTNAME,
      port: port ?? (await freePort()),
      password: password(),
      env: voidAppEnv(deps.root, user(), id),
    }
    const handle = await deps.start(id, options)
    const endpoint = { url: `http://${HOSTNAME}:${options.port}`, username: USERNAME, password: options.password }
    const entry = { endpoint, stop: handle.stop, ready: handle.ready ?? Promise.resolve(), lastBusy: now() }
    entry.ready.catch(() => undefined)
    running.set(id, entry)
    cancelSweep ??= every(() => void sweep().catch(() => undefined), IDLE_SWEEP_MS)
    void handle.exited?.then(
      () => drop(id, entry),
      () => drop(id, entry),
    )
    return endpoint
  }

  const ensure = (id: string, options: { port?: number } = {}) => {
    const current = running.get(id)
    if (current) {
      current.lastBusy = now()
      return Promise.resolve(current.endpoint)
    }
    const pending = starting.get(id)
    if (pending) return pending
    const created = launch(id, options.port).finally(() => starting.delete(id))
    starting.set(id, created)
    return created
  }

  const stop = async (id: string) => {
    await starting.get(id)?.catch(() => undefined)
    const current = running.get(id)
    if (!current) return
    drop(id, current)
    await current.stop()
  }

  const stopAll = async () => {
    await Promise.allSettled([...starting.values()])
    await Promise.all([...running.keys()].map(stop))
  }

  const sweepOnce = async () => {
    await Promise.all(
      [...running.entries()]
        .filter(([id]) => id !== viewed)
        .map(async ([id, core]) => {
          if (await isCoreBusy(core.endpoint, fetcher)) {
            core.lastBusy = now()
            return
          }
          if (id === viewed || now() - core.lastBusy < IDLE_STOP_MS) return
          await stop(id).catch(() => undefined)
        }),
    )
  }

  const sweep = () => {
    sweeping ??= sweepOnce().finally(() => {
      sweeping = undefined
    })
    return sweeping
  }

  const setViewed = (id: string | undefined) => {
    const previous = viewed && viewed !== id ? running.get(viewed) : undefined
    if (previous) previous.lastBusy = now()
    const next = id ? running.get(id) : undefined
    if (next) next.lastBusy = now()
    viewed = id
  }

  return {
    ensure,
    stop,
    stopAll,
    sweep,
    setViewed,
    viewed: () => viewed,
    running: () => [...running.keys()],
    endpoint: (id: string) => running.get(id)?.endpoint,
    ready: (id: string) => running.get(id)?.ready ?? Promise.resolve(),
  }
}

export type Cores = ReturnType<typeof createCores>
