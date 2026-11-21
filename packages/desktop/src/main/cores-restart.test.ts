import { beforeEach, describe, expect, test } from "bun:test"
import {
  RESTART_DELAYS_MS,
  RESTART_MAX_ATTEMPTS,
  RESTART_WINDOW_MS,
  STABLE_UPTIME_MS,
  createCores,
  type CoreStart,
  type CoreStatus,
} from "./cores"

type Timer = { at: number; run: () => void; cancelled: boolean }

let clock: number
let timers: Timer[]
let events: CoreStatus[]
let starts: string[]
let exits: Record<string, Array<() => void>>
let stops: string[]
let failStarts: number
let readyFails: boolean

const start: CoreStart = async (id) => {
  if (failStarts > 0) {
    failStarts -= 1
    throw new Error("spawn failed")
  }
  starts.push(id)
  let exit!: () => void
  const exited = new Promise<void>((resolve) => {
    exit = resolve
  })
  ;(exits[id] ??= []).push(exit)
  return {
    exited,
    ready: readyFails ? Promise.reject(new Error("unhealthy")) : Promise.resolve(),
    stop: async () => {
      stops.push(id)
      exit()
    },
  }
}

function make() {
  let port = 7000
  return createCores({
    root: "/tmp/void-cores-restart-root",
    start,
    user: () => ({}),
    freePort: async () => port++,
    password: () => `pw-${port++}`,
    now: () => clock,
    every: () => () => {},
    prepare: async () => {},
    onStatus: (event) => events.push(event),
    after: (run, ms) => {
      const timer = { at: clock + ms, run, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  })
}

const pending = () => timers.filter((timer) => !timer.cancelled)

const snapshot = () => `${events.length}:${starts.length}:${stops.length}:${timers.length}`

async function settle() {
  let quiet = 0
  let last = snapshot()
  while (quiet < 4) {
    await new Promise((resolve) => setTimeout(resolve, 2))
    const next = snapshot()
    quiet = next === last ? quiet + 1 : 0
    last = next
  }
}

async function crash(id: string) {
  exits[id].at(-1)!()
  await settle()
}

async function fire() {
  const timer = pending()[0]
  timer.cancelled = true
  clock = Math.max(clock, timer.at)
  timer.run()
  await settle()
}

beforeEach(() => {
  clock = 0
  timers = []
  events = []
  starts = []
  exits = {}
  stops = []
  failStarts = 0
  readyFails = false
})

describe("core restart", () => {
  test("restarts the viewed core after a crash on a new port and password", async () => {
    const cores = make()
    const first = await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    expect(cores.running()).toEqual([])
    expect(events).toEqual([{ space: "work", state: "restarting", attempt: 1, delayMs: RESTART_DELAYS_MS[0] }])
    expect(pending()[0].at).toBe(RESTART_DELAYS_MS[0])
    await fire()
    expect(starts).toEqual(["work", "work"])
    const second = cores.endpoint("work")!
    expect(second.url).not.toBe(first.url)
    expect(second.password).not.toBe(first.password)
    expect(events.at(-1)).toEqual({ space: "work", state: "up", endpoint: second })
  })

  test("does not restart a crashed core that is not viewed", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("work")
    await crash("work")
    expect(pending()).toEqual([])
    expect(events).toEqual([])
    expect(cores.running()).toEqual([])
  })

  test("does not restart after an intentional stop", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await cores.stop("work")
    await settle()
    expect(stops).toEqual(["work"])
    expect(pending()).toEqual([])
    expect(events).toEqual([])
    expect(starts).toEqual(["work"])
  })

  test("does not restart anything on stopAll", async () => {
    const cores = make()
    await cores.ensure("work")
    await cores.ensure("home")
    cores.setViewed("work")
    await cores.stopAll()
    await settle()
    expect(pending()).toEqual([])
    expect(events).toEqual([])
    expect(starts).toEqual(["work", "home"])
  })

  test("switching away from a space leaves its core alone and cancels a pending restart", async () => {
    const cores = make()
    await cores.ensure("work")
    await cores.ensure("home")
    cores.setViewed("work")
    await crash("work")
    expect(pending()).toHaveLength(1)
    cores.setViewed("home")
    expect(pending()).toEqual([])
    expect(starts).toEqual(["work", "home"])
    expect(cores.running()).toEqual(["home"])
  })

  test("a stop while a restart is pending cancels it", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    await cores.stop("work")
    expect(pending()).toEqual([])
    expect(starts).toEqual(["work"])
  })

  test("the delay grows with every consecutive crash", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    for (let i = 0; i < RESTART_MAX_ATTEMPTS; i++) {
      await crash("work")
      await fire()
    }
    const delays = events.filter((event) => event.state === "restarting").map((event) => event.delayMs)
    expect(delays).toEqual(RESTART_DELAYS_MS.slice(0, RESTART_MAX_ATTEMPTS))
    expect(delays).toEqual([...delays].sort((a, b) => a! - b!))
    expect(new Set(delays).size).toBe(delays.length)
  })

  test("a failed spawn counts as an attempt and is retried with the next delay", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    failStarts = 1
    await crash("work")
    await fire()
    expect(cores.running()).toEqual([])
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 2, delayMs: RESTART_DELAYS_MS[1] })
    await fire()
    expect(cores.running()).toEqual(["work"])
    expect(events.at(-1)?.state).toBe("up")
  })

  test("an unhealthy restarted core is stopped and counted as a crash", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    readyFails = true
    await fire()
    expect(stops).toEqual(["work"])
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 2 })
    expect(events.some((event) => event.state === "up")).toBe(false)
  })

  test("gives up after the attempt cap inside the window and reports failed", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    for (let i = 0; i < RESTART_MAX_ATTEMPTS; i++) {
      await crash("work")
      await fire()
    }
    await crash("work")
    expect(pending()).toEqual([])
    expect(events.at(-1)).toEqual({ space: "work", state: "failed" })
    expect(starts).toHaveLength(RESTART_MAX_ATTEMPTS + 1)
    expect(cores.running()).toEqual([])
  })

  test("attempts older than the window no longer count", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    for (let i = 0; i < RESTART_MAX_ATTEMPTS - 1; i++) {
      await crash("work")
      await fire()
    }
    clock += RESTART_WINDOW_MS
    await crash("work")
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 1, delayMs: RESTART_DELAYS_MS[0] })
  })

  test("the backoff resets after the core stayed up long enough", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    await fire()
    await crash("work")
    await fire()
    expect(events.filter((event) => event.state === "restarting").at(-1)?.delayMs).toBe(RESTART_DELAYS_MS[1])
    clock += STABLE_UPTIME_MS
    await crash("work")
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 1, delayMs: RESTART_DELAYS_MS[0] })
  })

  test("a crash right after a restart does not reset the backoff", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    await fire()
    clock += STABLE_UPTIME_MS - 1
    await crash("work")
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 2, delayMs: RESTART_DELAYS_MS[1] })
  })

  test("a manual start after the failed state clears it and reports up", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    for (let i = 0; i < RESTART_MAX_ATTEMPTS; i++) {
      await crash("work")
      await fire()
    }
    await crash("work")
    expect(events.at(-1)?.state).toBe("failed")
    const endpoint = await cores.ensure("work")
    await settle()
    expect(events.at(-1)).toEqual({ space: "work", state: "up", endpoint })
    await crash("work")
    expect(events.at(-1)).toMatchObject({ state: "restarting", attempt: 1 })
  })

  test("a crash that lands while stopAll waits does not schedule a restart", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    const stopping = cores.stopAll()
    await crash("work")
    await stopping
    expect(pending()).toEqual([])
    expect(events).toEqual([])
    expect(starts).toEqual(["work"])
  })

  test("a restart launch that fails after stopAll began is not retried", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    const timer = pending()[0]
    failStarts = 1
    const stopping = cores.stopAll()
    timer.run()
    await stopping
    await settle()
    expect(pending()).toEqual([])
    expect(starts).toEqual(["work"])
  })

  test("a failed manual start after a pending restart reports failed", async () => {
    const cores = make()
    await cores.ensure("work")
    cores.setViewed("work")
    await crash("work")
    failStarts = 1
    await expect(cores.ensure("work")).rejects.toThrow("spawn failed")
    expect(pending()).toEqual([])
    expect(events.at(-1)).toEqual({ space: "work", state: "failed" })
  })
})
