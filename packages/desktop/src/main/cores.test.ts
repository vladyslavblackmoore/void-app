import { beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { IDLE_STOP_MS, createCores, isCoreBusy, type CoreStart } from "./cores"

const root = join("/tmp", "void-cores-root")

type Call = { id: string; port: number; password: string; env: Record<string, string> }

let clock: number
let calls: Call[]
let stops: string[]
let nextPort: number
let busy: Record<string, boolean>
let failProject: boolean
let gate: Promise<void> | undefined
let exits: Record<string, () => void>
let startGate: Promise<void> | undefined
let stopFails: boolean

const start: CoreStart = async (id, options) => {
  await startGate
  calls.push({ id, port: options.port, password: options.password, env: options.env })
  const exited = new Promise<void>((resolve) => {
    exits[id] = resolve
  })
  return {
    exited,
    stop: async () => {
      stops.push(id)
      if (stopFails) throw new Error("stop failed")
    },
  }
}

function fetcher(url: string | URL, init?: RequestInit) {
  const parsed = new URL(url)
  const auth = (init?.headers as Record<string, string>)?.authorization
  const call = calls.find((item) => String(item.port) === parsed.port)
  if (!call || auth !== `Basic ${Buffer.from(`opencode:${call.password}`).toString("base64")}`) {
    return Promise.resolve(new Response("no", { status: 401 }))
  }
  if (parsed.pathname === "/project") {
    if (gate) return gate.then(() => Response.json([{ worktree: "/a", sandboxes: [] }]))
    if (failProject) return Promise.reject(new Error("down"))
    return Promise.resolve(Response.json([{ worktree: "/a", sandboxes: ["/b"] }]))
  }
  if (parsed.pathname === "/session/status") {
    const directory = parsed.searchParams.get("directory") ?? ""
    const active = busy[`${call.id}:${directory}`]
    return Promise.resolve(Response.json(active ? { s1: { type: "busy" } } : {}))
  }
  return Promise.resolve(new Response("?", { status: 404 }))
}

function make() {
  return createCores({
    root,
    start,
    user: () => ({}),
    freePort: async () => nextPort++,
    password: () => `pw-${nextPort++}`,
    fetch: fetcher as never,
    now: () => clock,
    every: () => () => {},
    prepare: async () => {},
  })
}

beforeEach(() => {
  clock = 0
  calls = []
  stops = []
  nextPort = 5000
  busy = {}
  failProject = false
  gate = undefined
  exits = {}
  startGate = undefined
  stopFails = false
})

describe("core manager", () => {
  test("starts a core per space with its own port, password and environment", async () => {
    const before = { ...process.env }
    const cores = make()
    const home = await cores.ensure("home")
    const work = await cores.ensure("work")
    expect(home.url).not.toBe(work.url)
    expect(home.password).not.toBe(work.password)
    expect(home.username).toBe("opencode")
    expect(calls[0].env.XDG_DATA_HOME).toBe(join(root, "spaces", "home", "data"))
    expect(calls[1].env.XDG_DATA_HOME).toBe(join(root, "spaces", "work", "data"))
    expect(calls[1].env.XDG_CACHE_HOME).toBe(join(root, "cache"))
    expect(calls[0].env).not.toBe(calls[1].env)
    expect(process.env.XDG_DATA_HOME).toBe(before.XDG_DATA_HOME)
  })

  test("gives an isolated space its login directory and a user space none", async () => {
    const base = await mkdtemp(join(tmpdir(), "void-cores-modes-"))
    try {
      for (const [id, sessionMode] of [["void", "isolated"], ["work", "user"]]) {
        await mkdir(join(base, "spaces", id), { recursive: true })
        await writeFile(
          join(base, "spaces", id, "space.json"),
          JSON.stringify({ id, name: id, class: "personal", sessionMode, color: "#fff" }),
        )
      }
      const cores = createCores({ root: base, start })
      await cores.ensure("void")
      await cores.ensure("work")
      expect(calls[0].env.VOID_SPACE_CLI_DIR).toBe(join(base, "spaces", "void", "cli"))
      expect("VOID_SPACE_CLI_DIR" in calls[1].env).toBe(false)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  test("starts a space once for concurrent and repeated calls", async () => {
    const cores = make()
    const [a, b] = await Promise.all([cores.ensure("home"), cores.ensure("home")])
    expect(a).toBe(b)
    await cores.ensure("home")
    expect(calls).toHaveLength(1)
  })

  test("runs the seeder before the start", async () => {
    const order: string[] = []
    const cores = createCores({
      root,
      start: async (id) => {
        order.push(`start:${id}`)
        return { stop: async () => {} }
      },
      user: () => ({}),
      freePort: async () => 1,
      password: () => "p",
      fetch: fetcher as never,
      now: () => 0,
      every: () => () => {},
      prepare: async (id) => {
        order.push(`prepare:${id}`)
      },
    })
    await cores.ensure("work")
    expect(order).toEqual(["prepare:work", "start:work"])
  })

  test("stops one core and starts a new one on the next ensure", async () => {
    const cores = make()
    await cores.ensure("home")
    await cores.stop("home")
    expect(stops).toEqual(["home"])
    expect(cores.running()).toEqual([])
    await cores.ensure("home")
    expect(calls).toHaveLength(2)
  })

  test("stops all cores", async () => {
    const cores = make()
    await cores.ensure("home")
    await cores.ensure("work")
    await cores.stopAll()
    expect(stops.sort()).toEqual(["home", "work"])
    expect(cores.running()).toEqual([])
  })

  test("a failed start is not kept", async () => {
    let fail = true
    const cores = createCores({
      root,
      start: async () => {
        if (fail) throw new Error("x")
        return { stop: async () => {} }
      },
      user: () => ({}),
      freePort: async () => 1,
      password: () => "p",
      fetch: fetcher as never,
      now: () => 0,
      every: () => () => {},
      prepare: async () => {},
    })
    await expect(cores.ensure("home")).rejects.toThrow("x")
    fail = false
    await cores.ensure("home")
    expect(cores.running()).toEqual(["home"])
  })
})

describe("idle stop", () => {
  test("never stops the viewed core", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("home")
    clock = IDLE_STOP_MS * 3
    await cores.sweep()
    expect(stops).toEqual([])
  })

  test("stops a non-viewed core after the idle period", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("home")
    await cores.ensure("work")
    clock = IDLE_STOP_MS - 1
    await cores.sweep()
    expect(stops).toEqual([])
    clock = IDLE_STOP_MS
    await cores.sweep()
    expect(stops).toEqual(["work"])
    expect(cores.running()).toEqual(["home"])
  })

  test("a busy session resets the idle period", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("home")
    await cores.ensure("work")
    clock = IDLE_STOP_MS - 1
    busy["work:/b"] = true
    await cores.sweep()
    busy["work:/b"] = false
    clock = IDLE_STOP_MS + 10
    await cores.sweep()
    expect(stops).toEqual([])
    clock = IDLE_STOP_MS * 2 - 2
    await cores.sweep()
    expect(stops).toEqual([])
    clock = IDLE_STOP_MS * 2 + 10
    await cores.sweep()
    expect(stops).toEqual(["work"])
  })

  test("a core that was just viewed starts its idle period when it is left", async () => {
    const cores = make()
    cores.setViewed("work")
    await cores.ensure("work")
    clock = IDLE_STOP_MS * 5
    cores.setViewed("home")
    await cores.sweep()
    expect(stops).toEqual([])
    clock += IDLE_STOP_MS
    await cores.sweep()
    expect(stops).toEqual(["work"])
  })

  test("a core that cannot be asked is treated as busy", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("work")
    failProject = true
    clock = IDLE_STOP_MS * 4
    await cores.sweep()
    expect(stops).toEqual([])
  })

  test("a repeated ensure counts as use", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("work")
    clock = IDLE_STOP_MS - 1
    await cores.ensure("work")
    clock = IDLE_STOP_MS + 5
    await cores.sweep()
    expect(stops).toEqual([])
  })
})

describe("busy detection", () => {
  test("polls the session status of every known directory", async () => {
    const cores = make()
    const core = await cores.ensure("work")
    expect(await isCoreBusy(core, fetcher as never)).toBe(false)
    busy["work:/a"] = true
    expect(await isCoreBusy(core, fetcher as never)).toBe(true)
  })

  test("is busy when the credentials are refused", async () => {
    const cores = make()
    const core = await cores.ensure("work")
    expect(await isCoreBusy({ ...core, password: "wrong" }, fetcher as never)).toBe(true)
  })
})

describe("races and exits", () => {
  test("a core that becomes viewed during the busy check is not stopped", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("work")
    clock = IDLE_STOP_MS * 2
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sweeping = cores.sweep()
    cores.setViewed("work")
    release()
    await sweeping
    expect(stops).toEqual([])
    expect(cores.running()).toEqual(["work"])
    clock += IDLE_STOP_MS - 1
    cores.setViewed("home")
    gate = undefined
    await cores.sweep()
    expect(stops).toEqual([])
  })

  test("a core that exits on its own is restarted by the next ensure", async () => {
    const cores = make()
    const first = await cores.ensure("work")
    exits.work()
    await Promise.resolve()
    await Promise.resolve()
    expect(cores.running()).toEqual([])
    const second = await cores.ensure("work")
    expect(second.url).not.toBe(first.url)
    expect(calls).toHaveLength(2)
  })

  test("a stop in progress is not undone by the exit signal", async () => {
    const cores = make()
    await cores.ensure("work")
    await cores.stop("work")
    exits.work()
    await cores.ensure("work")
    exits.work()
    await Promise.resolve()
    expect(calls).toHaveLength(2)
  })

  test("stop during an in-flight start stops the new core", async () => {
    const cores = make()
    let release!: () => void
    startGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = cores.ensure("work")
    const stopping = cores.stop("work")
    release()
    await pending
    await stopping
    expect(stops).toEqual(["work"])
    expect(cores.running()).toEqual([])
  })

  test("a rejected stop does not break the sweep", async () => {
    const cores = make()
    cores.setViewed("home")
    await cores.ensure("work")
    stopFails = true
    clock = IDLE_STOP_MS
    await cores.sweep()
    expect(stops).toEqual(["work"])
    expect(cores.running()).toEqual([])
  })
})
