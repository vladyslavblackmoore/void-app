import { afterEach, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { createFakeWorker, type FakeOptions } from "../src/fake"
import { startServer, type BrokerServer } from "../src/server"
import type { WorkerLink } from "../src/types"
import type { WorkerEntry } from "../src/workers"
import { connect, tempDir, text, worker, type Client } from "./helpers"

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

type Setup = {
  workers?: Partial<WorkerEntry>[]
  maxActive?: number
  queueDepth?: number
  fake?: (id: string) => FakeOptions
  closeTimeoutMs?: number
  stateDir?: string
}

async function setup(options: Setup = {}) {
  const dir = options.stateDir ?? path.join(await tempDir(), "state", "broker")
  const links = new Map<string, WorkerLink>()
  const created: string[] = []
  const server: BrokerServer = await startServer({
    stateDir: dir,
    config: {
      maxActive: options.maxActive ?? 4,
      queueDepth: options.queueDepth ?? 4,
      workers: (options.workers ?? [{ id: "w1" }, { id: "w2" }]).map((entry) => ({ ...worker(entry.id ?? "w"), ...entry })),
    },
    closeTimeoutMs: options.closeTimeoutMs,
    createLink: (entry) => {
      created.push(entry.id)
      const link = createFakeWorker(options.fake?.(entry.id) ?? {})
      links.set(entry.id, link)
      return link
    },
  })
  cleanup.push(() => server.close())
  const client: Client = await connect(server.socketPath)
  cleanup.push(() => client.close())
  let id = 100
  const start = async (workerId: string, extra: object = {}) => {
    const sent = ++id
    client.send({ jsonrpc: "2.0", id: sent, method: "delegate.start", params: { worker: workerId, prompt: "go", ...extra } })
    return client.next((message) => message.id === sent)
  }
  const result = (runId: string) => client.next((message) => message.method === "delegate.result" && message.params?.["runId"] === runId)
  return { server, client, dir, links, created, start, result }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("warm workers start with the broker and the others on the first delegate", async () => {
  const state = await setup({ workers: [{ id: "w1", warm: true }, { id: "w2" }] })
  expect(state.created).toEqual(["w1"])
  expect((await state.links.get("w1")?.health())?.ok).toBe(true)
  const run = await state.start("w2")
  await state.result(text(run.result?.runId))
  expect(state.created).toEqual(["w1", "w2"])
})

test("a second run on a busy worker waits in a FIFO queue and runs after the first", async () => {
  const state = await setup({ fake: () => ({ chunks: ["a"], delayMs: 80 }) })
  const first = text((await state.start("w1")).result?.runId)
  const second = text((await state.start("w1")).result?.runId)
  const third = text((await state.start("w1")).result?.runId)
  const order: string[] = []
  for (const id of [first, second, third]) {
    void state.result(id).then(() => order.push(id))
  }
  await sleep(600)
  expect(order).toEqual([first, second, third])
})

test("beyond the queue depth a run is refused with busy", async () => {
  const state = await setup({ queueDepth: 1, fake: () => ({ chunks: ["a"], delayMs: 100 }) })
  expect((await state.start("w1")).result?.runId).toBeDefined()
  expect((await state.start("w1")).result?.runId).toBeDefined()
  const refused = await state.start("w1")
  expect(refused.error?.code).toBe(-32002)
})

test("a queued run is removed by delegate.cancel and never reaches the worker", async () => {
  const prompts: string[] = []
  const state = await setup({ fake: () => ({ chunks: ["a"], delayMs: 100 }) })
  const first = text((await state.start("w1", { prompt: "one" })).result?.runId)
  const queued = text((await state.start("w1", { prompt: "two" })).result?.runId)
  const link = state.links.get("w1")!
  const original = link.prompt.bind(link)
  link.prompt = (value) => {
    prompts.push(value)
    return original(value)
  }
  state.client.send({ jsonrpc: "2.0", id: 1, method: "delegate.cancel", params: { runId: queued } })
  expect((await state.client.next((message) => message.id === 1)).result).toEqual({ cancelled: true })
  expect((await state.result(queued)).params).toMatchObject({ stopReason: "cancelled", text: "" })
  expect((await state.result(first)).params).toMatchObject({ stopReason: "end_turn" })
  expect(prompts).toEqual([])
})

test("maxActive makes a fifth concurrent worker run wait until a slot is free", async () => {
  let running = 0
  let peak = 0
  const state = await setup({
    maxActive: 4,
    workers: [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }, { id: "w5" }],
    fake: () => ({
      chunks: ["a"],
      delayMs: 120,
      onPrompt: () => {
        running += 1
        peak = Math.max(peak, running)
      },
      onDone: () => {
        running -= 1
      },
    }),
  })
  const ids: string[] = []
  for (const id of ["w1", "w2", "w3", "w4", "w5"]) ids.push(text((await state.start(id)).result?.runId))
  expect(ids.length).toBe(5)
  state.client.send({ jsonrpc: "2.0", id: 1, method: "broker.health" })
  const health = await state.client.next((message) => message.id === 1)
  expect(health.result).toMatchObject({ maxActive: 4, activeRuns: 4, queuedRuns: 1 })
  const results = await Promise.all(ids.map((id) => state.result(id)))
  expect(results.every((message) => message.params?.["stopReason"] === "end_turn")).toBe(true)
  expect(peak).toBe(4)
})

test("with maxActive 1 the second worker's run starts only after the first run ends", async () => {
  const stamps: Record<string, number[]> = {}
  const state = await setup({
    maxActive: 1,
    fake: (id) => ({ chunks: ["a"], delayMs: 150, onPrompt: () => (stamps[id] = [...(stamps[id] ?? []), Date.now()]) }),
  })
  const a = text((await state.start("w1")).result?.runId)
  const b = text((await state.start("w2")).result?.runId)
  await state.result(a)
  const aDone = Date.now()
  await state.result(b)
  expect(stamps["w2"]?.[0]).toBeGreaterThanOrEqual(aDone - 20)
})

test("a crashed run returns an error and the next delegate resumes the same session", async () => {
  const resumed: (string | undefined)[] = []
  const state = await setup({
    fake: () => ({
      chunks: ["alive"],
      crashOnPrompt: [2],
      onStart: (resume) => resumed.push(resume),
    }),
  })
  const first = await state.result(text((await state.start("w1")).result?.runId))
  const session = z.string().parse(first.params?.["sessionId"])
  expect(session.length).toBeGreaterThan(0)
  const crashed = await state.result(text((await state.start("w1")).result?.runId))
  expect(crashed.params?.["stopReason"]).toBe("error")
  const after = await state.result(text((await state.start("w1")).result?.runId))
  expect(after.params).toMatchObject({ stopReason: "end_turn", text: "alive", sessionId: session })
  expect(resumed).toEqual([undefined, session])
  const stored = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(path.join(state.dir, "sessions.json"), "utf8")))
  expect(stored["w1"]).toBe(session)
})

test("session ids persist across a broker restart", async () => {
  const dir = path.join(await tempDir(), "state", "broker")
  const resumed: (string | undefined)[] = []
  const fake = () => ({ onStart: (resume?: string) => resumed.push(resume) })
  const one = await setup({ stateDir: dir, fake })
  const first = await one.result(text((await one.start("w1")).result?.runId))
  await one.server.close()
  const two = await setup({ stateDir: dir, fake })
  await two.result(text((await two.start("w1")).result?.runId))
  expect(resumed).toEqual([undefined, text(first.params?.["sessionId"])])
})

test("fresh closes the session and starts a new one", async () => {
  const resumed: (string | undefined)[] = []
  const state = await setup({ fake: () => ({ onStart: (resume) => resumed.push(resume) }) })
  const first = await state.result(text((await state.start("w1")).result?.runId))
  const same = await state.result(text((await state.start("w1")).result?.runId))
  const fresh = await state.result(text((await state.start("w1", { fresh: true })).result?.runId))
  expect(same.params?.["sessionId"]).toBe(first.params?.["sessionId"])
  expect(fresh.params?.["sessionId"]).not.toBe(first.params?.["sessionId"])
  expect(resumed.length).toBe(2)
  expect(resumed[1]).toBeUndefined()
  const stored = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(path.join(state.dir, "sessions.json"), "utf8")))
  expect(stored["w1"]).toBe(text(fresh.params?.["sessionId"]))
})

test("shutdown closes every link and a hung close is abandoned after the timeout", async () => {
  const state = await setup({ closeTimeoutMs: 100, fake: () => ({ chunks: ["a"] }) })
  await state.result(text((await state.start("w1")).result?.runId))
  await state.result(text((await state.start("w2")).result?.runId))
  const closed: string[] = []
  const w1 = state.links.get("w1")!
  const w2 = state.links.get("w2")!
  const closeW1 = w1.close.bind(w1)
  w1.close = async () => {
    closed.push("w1")
    await closeW1()
  }
  w2.close = () => {
    closed.push("w2")
    return new Promise<void>(() => undefined)
  }
  const began = Date.now()
  await state.server.close()
  expect(closed.sort()).toEqual(["w1", "w2"])
  expect(Date.now() - began).toBeLessThan(2000)
})

test("every run is logged with worker, run id, timestamps and the stop reason", async () => {
  const state = await setup({
    fake: () => ({ chunks: ["a"], delayMs: 20, timing: { stdinAt: 111, binaryFirstAt: 222 } }),
  })
  const runId = text((await state.start("w1", { taskId: "t1" })).result?.runId)
  const done = await state.result(runId)
  await sleep(50)
  const lines = (await readFile(path.join(state.dir, "log", "runs.jsonl"), "utf8")).trim().split("\n")
  const entry = z
    .object({
      runId: z.string(),
      worker: z.string(),
      sessionId: z.string(),
      taskId: z.string().nullable(),
      queuedAt: z.number(),
      startedAt: z.number(),
      firstEventAt: z.number().nullable(),
      resultAt: z.number(),
      stopReason: z.string(),
      stdinAt: z.number().nullable(),
      binaryFirstAt: z.number().nullable(),
    })
    .parse(JSON.parse(lines[0] ?? ""))
  expect(lines.length).toBe(1)
  expect(entry).toMatchObject({ runId, worker: "w1", taskId: "t1", stopReason: "end_turn", stdinAt: 111, binaryFirstAt: 222 })
  expect(entry.sessionId).toBe(text(done.params?.["sessionId"]))
  expect(entry.startedAt).toBeGreaterThanOrEqual(entry.queuedAt)
  expect(entry.firstEventAt ?? 0).toBeGreaterThanOrEqual(entry.startedAt)
  expect(entry.resultAt).toBeGreaterThanOrEqual(entry.firstEventAt ?? 0)
})

test("a crashed run is logged with the error", async () => {
  const state = await setup({ fake: () => ({ crashOnPrompt: [1] }) })
  const runId = text((await state.start("w1")).result?.runId)
  await state.result(runId)
  await sleep(50)
  const line = JSON.parse((await readFile(path.join(state.dir, "log", "runs.jsonl"), "utf8")).trim())
  expect(line).toMatchObject({ runId, stopReason: "error", firstEventAt: null })
  expect(typeof line.error).toBe("string")
})
