import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { brokerPaths, withBroker } from "./broker"
import { createBrokerStatus, type BrokerStatus } from "./broker-status"
import type { CoreStart } from "./cores"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-broker-status-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function seedWorkers(id = "home") {
  const paths = brokerPaths(root, id)
  await mkdir(dirname(paths.config), { recursive: true })
  await writeFile(paths.config, JSON.stringify({ workers: [] }))
}

const script = async (name: string, body: string) => {
  const file = join(root, name)
  await writeFile(file, body)
  return { command: process.execPath, entry: file, env: {} }
}

const okEntry = `console.log("ready")\nprocess.stdin.on("end", () => process.exit(0))\nprocess.stdin.resume()\n`
const options = { hostname: "127.0.0.1", port: 1, password: "p", env: {} as Record<string, string> }
const core: CoreStart = async () => ({ stop: async () => {} })

describe("status store", () => {
  test("is empty until a state is set and returns the latest", () => {
    const store = createBrokerStatus()
    expect(store.get("home")).toBeUndefined()
    store.set({ space: "home", state: "starting" })
    store.set({ space: "home", state: "running" })
    expect(store.get("home")).toEqual({ space: "home", state: "running" })
    expect(store.get("other")).toBeUndefined()
  })

  test("notifies subscribers until they unsubscribe", () => {
    const store = createBrokerStatus()
    const seen: BrokerStatus[] = []
    const off = store.subscribe((status) => seen.push(status))
    store.set({ space: "home", state: "starting" })
    off()
    store.set({ space: "home", state: "running" })
    expect(seen).toEqual([{ space: "home", state: "starting" }])
  })
})

describe("withBroker status", () => {
  test("goes starting, running, stopped", async () => {
    await seedWorkers()
    const status = createBrokerStatus()
    const seen: string[] = []
    status.subscribe((event) => seen.push(event.state))
    const runtime = await script("ok.mjs", okEntry)
    const handle = await withBroker(core, { root, runtime, warn: () => {}, status })("home", options)
    expect(seen).toEqual(["starting", "running"])
    expect(status.get("home")?.state).toBe("running")
    await handle.stop()
    expect(seen).toEqual(["starting", "running", "stopped"])
  })

  test("reports failed with the exit code when the broker dies before ready", async () => {
    await seedWorkers()
    const status = createBrokerStatus()
    const runtime = await script("die.mjs", `process.exit(3)\n`)
    await withBroker(core, { root, runtime, warn: () => {}, status })("home", options)
    expect(status.get("home")).toEqual({ space: "home", state: "failed" })
  })

  test("reports failed when the running broker exits on its own", async () => {
    await seedWorkers()
    const status = createBrokerStatus()
    const runtime = await script("crash.mjs", `console.log("ready")\nsetTimeout(() => process.exit(2), 100)\n`)
    await withBroker(core, { root, runtime, warn: () => {}, status })("home", options)
    for (let i = 0; i < 50 && status.get("home")?.state !== "failed"; i++) await new Promise((resolve) => setTimeout(resolve, 50))
    expect(status.get("home")).toEqual({ space: "home", state: "failed", exitCode: 2 })
  })

  test("reports nothing without a workers file", async () => {
    const status = createBrokerStatus()
    const runtime = await script("ok.mjs", okEntry)
    await withBroker(core, { root, runtime, warn: () => {}, status })("home", options)
    expect(status.get("home")).toBeUndefined()
  })
})
