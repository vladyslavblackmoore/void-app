import { afterEach, expect, test } from "bun:test"
import path from "node:path"
import { createFakeWorker } from "../../../void-broker/src/fake"
import { startServer } from "../../../void-broker/src/server"
import delegate from "../../resources/tools/delegate"
import { failure, tempDir, worker } from "../../../void-broker/test/helpers"

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
  delete process.env["VOID_BROKER_SOCKET"]
})

async function setup(options: { chunks?: string[]; delayMs?: number } = {}) {
  const stateDir = await tempDir()
  const server = await startServer({
    stateDir: path.join(stateDir, "state", "broker"),
    config: { maxActive: 4, workers: [worker("w1")] },
    createLink: () => createFakeWorker(options),
  })
  cleanup.push(() => server.close())
  process.env["VOID_BROKER_SOCKET"] = server.socketPath
  return server
}

const context = (abort: AbortSignal) => ({
  sessionID: "s",
  messageID: "m",
  agent: "main",
  directory: "/",
  worktree: "/",
  abort,
  metadata: () => {},
  ask: async () => {},
})

type Args = { worker: string; prompt: string; task_id?: string; fresh?: boolean }

const run = async (args: Args, abort = new AbortController().signal) => {
  const result = await delegate.execute(args, context(abort))
  if (typeof result === "string") throw new Error("expected a structured result")
  return result
}

test("returns the worker text, stop reason, run id and session id", async () => {
  await setup({ chunks: ["fake ", "reply"] })
  const result = await run({ worker: "w1", prompt: "go", task_id: "t1" })
  expect(result.output).toContain("fake reply")
  expect(result.output).toContain("stopReason: end_turn")
  expect(result.metadata).toMatchObject({ stopReason: "end_turn", sessionId: "fake-session", worker: "w1" })
  expect(typeof result.metadata?.["runId"]).toBe("string")
  expect(result.output).toContain(`runId: ${result.metadata?.["runId"]}`)
  expect(result.output).toContain("sessionId: fake-session")
})

test("an unknown worker is reported as an error", async () => {
  await setup()
  expect((await failure(run({ worker: "nope", prompt: "go" })))?.message).toBe("unknown worker: nope")
})

test("a missing socket is reported as an error", async () => {
  process.env["VOID_BROKER_SOCKET"] = path.join(await tempDir(), "none.sock")
  expect((await failure(run({ worker: "w1", prompt: "go" })))?.message).toContain("cannot reach the broker")
})

test("abort sends delegate.cancel and returns cancelled", async () => {
  await setup({ chunks: ["a", "b", "c", "d", "e", "f"], delayMs: 100 })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 150)
  const started = Date.now()
  const result = await run({ worker: "w1", prompt: "go" }, controller.signal)
  expect(result.metadata?.["stopReason"]).toBe("cancelled")
  expect(result.output).toContain("stopReason: cancelled")
  expect(Date.now() - started).toBeLessThan(500)
})

test("an already aborted signal cancels as soon as the run id is known", async () => {
  await setup({ chunks: ["a", "b", "c"], delayMs: 100 })
  const controller = new AbortController()
  controller.abort()
  const result = await run({ worker: "w1", prompt: "go" }, controller.signal)
  expect(result.metadata?.["stopReason"]).toBe("cancelled")
})

test("a result slower than 100 ms is still awaited", async () => {
  await setup({ chunks: ["x"], delayMs: 300 })
  const result = await run({ worker: "w1", prompt: "go", fresh: true })
  expect(result.output).toContain("x")
})
