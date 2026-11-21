import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { readSpace } from "./spaces"
import { userXdg, voidAppEnv } from "./void-home"

export const IDLE_STOP_MS = 30 * 60 * 1000
export const IDLE_SWEEP_MS = 60 * 1000
export const RESTART_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
export const RESTART_MAX_ATTEMPTS = RESTART_DELAYS_MS.length
export const RESTART_WINDOW_MS = 5 * 60 * 1000
export const STABLE_UPTIME_MS = 60 * 1000

const HOSTNAME = "127.0.0.1"
const USERNAME = "opencode"
const REQUEST_TIMEOUT_MS = 5000

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export type CoreEndpoint = { url: string; username: string; password: string }

export type CoreStartOptions = { hostname: string; port: number; password: string; env: Record<string, string> }
export type CoreStart = (id: string, options: CoreStartOptions) => Promise<{ stop: () => Promise<void>; ready?: Promise<void>; exited?: Promise<void> }>

export type CoreStatus = {
  space: string
  state: "restarting" | "up" | "failed"
  attempt?: number
  delayMs?: number
  endpoint?: CoreEndpoint
}

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
  after?: (run: () => void, ms: number) => () => void
  onStatus?: (event: CoreStatus) => void
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

type Running = {
  endpoint: CoreEndpoint
  stop: () => Promise<void>
  ready: Promise<void>
  lastBusy: number
  startedAt: number
}

type Supervision = { attempts: number[]; cancel?: () => void; announce: boolean }

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

  const after =
    deps.after ??
    ((run, ms) => {
      const timer = setTimeout(run, ms)
      timer.unref()
      return () => clearTimeout(timer)
    })
  const emit = (event: CoreStatus) => deps.onStatus?.(event)

  const running = new Map<string, Running>()
  const supervision = new Map<string, Supervision>()
  let closed = false
  const viewedBy = new Map<string | number, string>()
  const queues = new Map<string, Promise<unknown>>()
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
    const space = await readSpace(deps.root, id)
    const options = {
      hostname: HOSTNAME,
      port: port ?? (await freePort()),
      password: password(),
      env: voidAppEnv(deps.root, user(), id, space?.sessionMode),
    }
    const handle = await deps.start(id, options)
    const endpoint = { url: `http://${HOSTNAME}:${options.port}`, username: USERNAME, password: options.password }
    const entry = { endpoint, stop: handle.stop, ready: handle.ready ?? Promise.resolve(), lastBusy: now(), startedAt: now() }
    entry.ready.catch(() => undefined)
    running.set(id, entry)
    cancelSweep ??= every(() => void sweep().catch(() => undefined), IDLE_SWEEP_MS)
    void handle.exited?.then(
      () => crashed(id, entry),
      () => crashed(id, entry),
    )
    return endpoint
  }

  const supervisor = (id: string) => {
    const existing = supervision.get(id)
    if (existing) return existing
    const created: Supervision = { attempts: [], announce: false }
    supervision.set(id, created)
    return created
  }

  const cancelRestart = (id: string) => {
    const sup = supervision.get(id)
    if (!sup) return
    sup.cancel?.()
    supervision.delete(id)
  }

  const crashed = (id: string, entry: Running) => {
    if (running.get(id) !== entry) return
    drop(id, entry)
    if (!isViewed(id)) return
    const sup = supervisor(id)
    if (now() - entry.startedAt >= STABLE_UPTIME_MS) sup.attempts = []
    scheduleRestart(id)
  }

  const scheduleRestart = (id: string) => {
    if (closed) return
    const sup = supervisor(id)
    const current = now()
    sup.attempts = sup.attempts.filter((at) => current - at < RESTART_WINDOW_MS)
    if (sup.attempts.length >= RESTART_MAX_ATTEMPTS) {
      sup.cancel = undefined
      sup.announce = true
      emit({ space: id, state: "failed" })
      return
    }
    const delayMs = RESTART_DELAYS_MS[Math.min(sup.attempts.length, RESTART_DELAYS_MS.length - 1)]
    sup.attempts.push(current)
    sup.announce = true
    emit({ space: id, state: "restarting", attempt: sup.attempts.length, delayMs })
    sup.cancel = after(() => restart(id), delayMs)
  }

  const announceUp = (id: string, entry: Running) =>
    entry.ready.then(
      () => {
        if (running.get(id) !== entry) return
        emit({ space: id, state: "up", endpoint: entry.endpoint })
      },
      () => {
        if (running.get(id) !== entry) return
        drop(id, entry)
        void entry.stop().catch(() => undefined)
        if (isViewed(id)) scheduleRestart(id)
      },
    )

  const restart = (id: string) => {
    const sup = supervision.get(id)
    if (sup) sup.cancel = undefined
    if (closed || !isViewed(id) || running.has(id)) return
    serialize(id, async () => {
      if (running.has(id) || !isViewed(id)) return
      await launch(id)
    }).then(
      () => {
        const entry = running.get(id)
        if (entry) void announceUp(id, entry)
      },
      () => {
        if (isViewed(id)) scheduleRestart(id)
      },
    )
  }

  const isViewed = (id: string) => [...viewedBy.values()].includes(id)

  const serialize = <T>(id: string, task: () => Promise<T>) => {
    const previous = queues.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    const tail = next.then(
      () => undefined,
      () => undefined,
    )
    queues.set(id, tail)
    void tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id)
    })
    return next
  }

  const ensure = (id: string, options: { port?: number } = {}) => {
    const current = running.get(id)
    if (current && !queues.has(id)) {
      current.lastBusy = now()
      return Promise.resolve(current.endpoint)
    }
    return serialize(id, async () => {
      const live = running.get(id)
      if (live) {
        live.lastBusy = now()
        return live.endpoint
      }
      const sup = supervision.get(id)
      const announce = sup?.announce === true
      cancelRestart(id)
      const endpoint = await launch(id, options.port).catch((error) => {
        if (announce) emit({ space: id, state: "failed" })
        throw error
      })
      const entry = running.get(id)
      if (announce && entry) void announceUp(id, entry)
      return endpoint
    })
  }

  const stop = (id: string) => {
    cancelRestart(id)
    return serialize(id, async () => {
      const current = running.get(id)
      if (!current) return
      drop(id, current)
      await current.stop()
    })
  }

  const stopAll = async () => {
    closed = true
    for (const id of [...supervision.keys()]) cancelRestart(id)
    await Promise.allSettled([...queues.values()])
    await Promise.all([...running.keys()].map(stop))
  }

  const sweepOnce = async () => {
    await Promise.all(
      [...running.entries()]
        .filter(([id]) => !isViewed(id))
        .map(async ([id, core]) => {
          if (await isCoreBusy(core.endpoint, fetcher)) {
            core.lastBusy = now()
            return
          }
          if (isViewed(id) || now() - core.lastBusy < IDLE_STOP_MS) return
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

  const setViewed = (id: string, window: string | number = 0) => {
    const previous = viewedBy.get(window)
    viewedBy.set(window, id)
    const left = previous && previous !== id ? running.get(previous) : undefined
    if (left) left.lastBusy = now()
    if (previous && previous !== id && !isViewed(previous)) cancelRestart(previous)
    const next = running.get(id)
    if (next) next.lastBusy = now()
  }

  const closeWindow = (window: string | number) => {
    const previous = viewedBy.get(window)
    viewedBy.delete(window)
    const left = previous ? running.get(previous) : undefined
    if (left) left.lastBusy = now()
    if (previous && !isViewed(previous)) cancelRestart(previous)
  }

  return {
    ensure,
    stop,
    stopAll,
    sweep,
    setViewed,
    closeWindow,
    viewed: (window: string | number = 0) => viewedBy.get(window),
    running: () => [...running.keys()],
    endpoint: (id: string) => running.get(id)?.endpoint,
    ready: (id: string) => running.get(id)?.ready ?? Promise.resolve(),
  }
}

export type Cores = ReturnType<typeof createCores>
