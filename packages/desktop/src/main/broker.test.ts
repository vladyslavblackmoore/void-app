import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import net from "node:net"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { brokerPaths, brokerRuntime, startBroker, withBroker } from "./broker"
import type { CoreStart } from "./cores"

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, "../../../void-broker/src/main.ts")
const stubborn = join(here, "fixtures/stubborn-broker.ts")
const slow = join(here, "fixtures/slow-broker.ts")

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-broker-desk-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function seedWorkers(id = "home") {
  const paths = brokerPaths(root, id)
  await mkdir(dirname(paths.config), { recursive: true })
  await writeFile(paths.config, JSON.stringify({ workers: [{ id: "w", backend: "anthropic-cli" }] }))
  return paths
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const settle = async (pid: number) => {
  for (let i = 0; i < 50 && alive(pid); i++) await new Promise((resolve) => setTimeout(resolve, 50))
}

const options = (extra: Record<string, string> = {}) => ({ hostname: "127.0.0.1", port: 1, password: "p", env: { ...extra } })

describe("paths", () => {
  test("lie inside the space directory", () => {
    const paths = brokerPaths("/r", "home")
    expect(paths.config).toBe("/r/spaces/home/config/broker/workers.json")
    expect(paths.stateDir).toBe("/r/spaces/home/state/broker")
    expect(paths.socket).toBe("/r/spaces/home/state/broker/broker.sock")
    expect(paths.memoryDb).toBe("/r/spaces/home/data/memory/graph.db")
    expect(paths.spaceConfig).toBe("/r/spaces/home/config/opencode")
  })
})

describe("startBroker", () => {
  const deps = () => ({ root, id: "home", runtime: { command: process.execPath, entry, env: {} }, env: {} as Record<string, string> })

  test("starts the real broker, serves the socket and removes it on stop", async () => {
    const paths = await seedWorkers()
    const broker = await startBroker(deps())
    expect(broker).toBeDefined()
    expect(existsSync(paths.socket)).toBe(true)
    await broker!.stop()
    expect(existsSync(paths.socket)).toBe(false)
  })

  test("passes the space config directory to the broker", async () => {
    const paths = await seedWorkers()
    const script = join(root, "env-entry.mjs")
    const out = join(root, "env.txt")
    await writeFile(
      script,
      `import { writeFileSync } from "node:fs"\nwriteFileSync(${JSON.stringify(out)}, process.env.VOID_BROKER_SPACE_CONFIG ?? "")\nconsole.log("ready")\nprocess.stdin.on("end", () => process.exit(0))\nprocess.stdin.resume()\n`,
    )
    const broker = await startBroker({ ...deps(), runtime: { command: process.execPath, entry: script, env: {} } })
    expect(await readFile(out, "utf8")).toBe(paths.spaceConfig)
    await broker!.stop()
  })

  test("returns nothing without a workers file", async () => {
    expect(await startBroker(deps())).toBeUndefined()
  })

  test("returns nothing when the entry file is missing", async () => {
    await seedWorkers()
    expect(await startBroker({ ...deps(), runtime: { command: process.execPath, entry: join(root, "none.ts"), env: {} } })).toBeUndefined()
  })

  test("kills a broker that ignores the shutdown together with its children", async () => {
    await seedWorkers()
    const pids = join(root, "pids")
    const broker = await startBroker({ ...deps(), runtime: { command: process.execPath, entry: stubborn, env: {} }, env: { STUB_PIDS: pids }, stopTimeoutMs: 300 })
    const [parent, child] = (await readFile(pids, "utf8")).split(" ").map(Number)
    expect(alive(parent!) && alive(child!)).toBe(true)
    await broker!.stop()
    await settle(parent!)
    await settle(child!)
    expect(alive(parent!)).toBe(false)
    expect(alive(child!)).toBe(false)
  })

  test("a second stop is harmless", async () => {
    await seedWorkers()
    const broker = await startBroker(deps())
    await broker!.stop()
    await broker!.stop()
  })
})

describe("withBroker", () => {
  const make = (inner: CoreStart, extra: Partial<Parameters<typeof withBroker>[1]> = {}) =>
    withBroker(inner, { root, runtime: { command: process.execPath, entry, env: {} }, warn: () => undefined, ...extra })

  test("starts the broker before the core and passes its socket in the core env", async () => {
    const paths = await seedWorkers()
    let seen: Record<string, string> = {}
    let socketThen = false
    const start = make(async (_id, opts) => {
      seen = opts.env
      socketThen = existsSync(paths.socket)
      return { stop: async () => undefined }
    })
    const handle = await start("home", options({ KEEP: "1" }))
    expect(socketThen).toBe(true)
    expect(seen).toMatchObject({ KEEP: "1", VOID_BROKER_SOCKET: paths.socket, VOID_SPACE_ID: "home" })
    await handle.stop()
    expect(existsSync(paths.socket)).toBe(false)
  })

  test("stops the broker when the core stops", async () => {
    const paths = await seedWorkers()
    let coreStopped = false
    const handle = await make(async () => ({
      stop: async () => {
        coreStopped = true
      },
    }))("home", options())
    await handle.stop()
    expect(coreStopped).toBe(true)
    expect(existsSync(paths.socket)).toBe(false)
  })

  test("stops the broker when the core fails to start", async () => {
    const paths = await seedWorkers()
    const failing = make(async () => {
      throw new Error("core failed")
    })
    await expect(failing("home", options())).rejects.toThrow("core failed")
    expect(existsSync(paths.socket)).toBe(false)
  })

  test("stops the broker when the core exits on its own", async () => {
    const paths = await seedWorkers()
    let exit!: () => void
    const exited = new Promise<void>((resolve) => (exit = resolve))
    await make(async () => ({ stop: async () => undefined, exited }))("home", options())
    expect(existsSync(paths.socket)).toBe(true)
    exit()
    for (let i = 0; i < 100 && existsSync(paths.socket); i++) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(existsSync(paths.socket)).toBe(false)
  })

  test("a restart right after the core exited waits for the old broker, whose late cleanup must not remove the new socket", async () => {
    const paths = await seedWorkers()
    let exit!: () => void
    const exited = new Promise<void>((resolve) => (exit = resolve))
    let launches = 0
    const start = make(
      async () => (++launches === 1 ? { stop: async () => undefined, exited } : { stop: async () => undefined }),
      { runtime: { command: process.execPath, entry: slow, env: {} } },
    )
    await start("home", options())
    exit()
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await start("home", options())
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(existsSync(paths.socket)).toBe(true)
    const reply = await new Promise<string>((resolve, reject) => {
      const client = net.connect(paths.socket)
      let data = ""
      client.on("data", (chunk) => (data += chunk.toString()))
      client.on("end", () => resolve(data))
      client.on("error", reject)
    })
    expect(reply).toBe("up\n")
    await second.stop()
  })

  test("starts the core without a broker when there is no workers file", async () => {
    let env: Record<string, string> = {}
    const handle = await make(async (_id, opts) => {
      env = opts.env
      return { stop: async () => undefined }
    })("home", options())
    expect(env["VOID_BROKER_SOCKET"]).toBeDefined()
    await handle.stop()
  })

  test("starts the core when the broker cannot be started", async () => {
    await seedWorkers()
    const warnings: string[] = []
    let started = false
    await make(
      async () => {
        started = true
        return { stop: async () => undefined }
      },
      { runtime: { command: join(root, "no-such-runtime"), entry, env: {} }, warn: (message) => warnings.push(message) },
    )("home", options())
    expect(started).toBe(true)
    expect(warnings.length).toBe(1)
  })
})

describe("brokerRuntime", () => {
  test("runs the packaged broker on the app binary as Node with the shim from the resources", () => {
    const runtime = brokerRuntime({
      packaged: true,
      execPath: "/app/Electron",
      resourcesPath: "/app/Resources",
      devEntry: "/dev/main.ts",
      env: { VOID_BROKER_RUNTIME: "ignored" },
    })
    expect(runtime).toEqual({
      command: "/app/Electron",
      entry: "/app/Resources/broker/broker.mjs",
      env: { ELECTRON_RUN_AS_NODE: "1", VOID_BROKER_SHIM: "/app/Resources/broker/shim.mjs" },
    })
  })

  test("runs the source entry on Bun in dev and lets the environment pick the runtime", () => {
    const input = { packaged: false, execPath: "/app/Electron", resourcesPath: "/r", devEntry: "/dev/main.ts" }
    expect(brokerRuntime({ ...input, env: {} })).toEqual({ command: "bun", entry: "/dev/main.ts", env: {} })
    expect(brokerRuntime({ ...input, env: { VOID_BROKER_RUNTIME: "/x/bun" } }).command).toBe("/x/bun")
  })
})
