import { afterEach, expect, test } from "bun:test"
import { stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { createFakeWorker } from "../src/fake"
import { startServer, type BrokerServer } from "../src/server"
import { connect, tempDir, text, worker, type Client } from "./helpers"

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!()
})

async function setup(options: { chunks?: string[]; delayMs?: number } = {}) {
  const stateDir = await tempDir()
  const server: BrokerServer = await startServer({
    stateDir: path.join(stateDir, "state", "broker"),
    config: { maxActive: 4, workers: [worker("w1"), worker("w2")] },
    createLink: () => createFakeWorker(options),
  })
  cleanup.push(() => server.close())
  const client: Client = await connect(server.socketPath)
  cleanup.push(() => client.close())
  return { server, client }
}

const isResponse = (id: number) => (message: { id?: unknown }) => message.id === id

test("socket file has mode 0600 inside a 0700 directory", async () => {
  const { server } = await setup()
  expect((await stat(server.socketPath)).mode & 0o777).toBe(0o600)
  expect((await stat(path.dirname(server.socketPath))).mode & 0o777).toBe(0o700)
  expect(path.basename(server.socketPath)).toBe("broker.sock")
})

test("workers.list and broker.health", async () => {
  const { client } = await setup()
  client.send({ jsonrpc: "2.0", id: 1, method: "workers.list" })
  const list = await client.next(isResponse(1))
  const listed = z.array(z.object({ id: z.string() })).parse(list.result?.workers)
  expect(listed.map((entry) => entry.id)).toEqual(["w1", "w2"])
  client.send({ jsonrpc: "2.0", id: 2, method: "broker.health" })
  const health = await client.next(isResponse(2))
  expect(health.result).toMatchObject({ ok: true, workers: 2, activeRuns: 0 })
})

test("delegate.start streams events then one result", async () => {
  const { client } = await setup({ chunks: ["one ", "two"] })
  client.send({ jsonrpc: "2.0", id: 1, method: "delegate.start", params: { worker: "w1", prompt: "go", taskId: "t1" } })
  const started = await client.next(isResponse(1))
  const runId = text(started.result?.runId)
  expect(typeof runId).toBe("string")
  const first = await client.next((message) => message.method === "delegate.event")
  expect(first.id).toBeUndefined()
  expect(first.params).toEqual({ runId, kind: "agent_message_chunk", text: "one " })
  const second = await client.next((message) => message.method === "delegate.event")
  expect(second.params?.text).toBe("two")
  const result = await client.next((message) => message.method === "delegate.result")
  expect(result.params).toMatchObject({ runId, stopReason: "end_turn", text: "one two" })
  expect(result.params?.usage).toBeDefined()
})

test("unknown worker id returns a json-rpc error", async () => {
  const { client } = await setup()
  client.send({ jsonrpc: "2.0", id: 7, method: "delegate.start", params: { worker: "nope", prompt: "go" } })
  const reply = await client.next(isResponse(7))
  expect(reply.result).toBeUndefined()
  expect(reply.error).toEqual({ code: -32001, message: "unknown worker: nope" })
})

test("protocol errors", async () => {
  const { client } = await setup()
  client.send({ jsonrpc: "2.0", id: 1, method: "nope" })
  expect((await client.next(isResponse(1))).error?.code).toBe(-32601)
  client.send({ jsonrpc: "2.0", id: 2, method: "delegate.start", params: { worker: "w1" } })
  expect((await client.next(isResponse(2))).error?.code).toBe(-32602)
  client.send({ jsonrpc: "2.0", id: 3, method: "delegate.cancel", params: { runId: "missing" } })
  expect((await client.next(isResponse(3))).error?.code).toBe(-32003)
  client.send({ jsonrpc: "2.0", id: 4 })
  expect((await client.next((message) => message.id === null)).error?.code).toBe(-32600)
})

test("delegate.cancel ends the run with a cancelled stop reason", async () => {
  const { client } = await setup({ chunks: ["a", "b", "c", "d"], delayMs: 100 })
  client.send({ jsonrpc: "2.0", id: 1, method: "delegate.start", params: { worker: "w1", prompt: "go" } })
  const runId = text((await client.next(isResponse(1))).result?.runId)
  client.send({ jsonrpc: "2.0", id: 2, method: "delegate.cancel", params: { runId } })
  expect((await client.next(isResponse(2))).result).toEqual({ cancelled: true })
  const result = await client.next((message) => message.method === "delegate.result")
  expect(result.params).toMatchObject({ runId, stopReason: "cancelled" })
})

test("a second run on a busy worker is refused, another worker runs in parallel", async () => {
  const { client } = await setup({ chunks: ["a"], delayMs: 100 })
  client.send({ jsonrpc: "2.0", id: 1, method: "delegate.start", params: { worker: "w1", prompt: "go" } })
  await client.next(isResponse(1))
  client.send({ jsonrpc: "2.0", id: 2, method: "delegate.start", params: { worker: "w1", prompt: "again" } })
  expect((await client.next(isResponse(2))).error?.code).toBe(-32002)
  client.send({ jsonrpc: "2.0", id: 3, method: "delegate.start", params: { worker: "w2", prompt: "go" } })
  expect((await client.next(isResponse(3))).result?.runId).toBeDefined()
  await client.next((message) => message.method === "delegate.result")
  await client.next((message) => message.method === "delegate.result")
})

test("the task id is prepended to the prompt", async () => {
  const prompts: string[] = []
  const stateDir = await tempDir()
  const server = await startServer({
    stateDir,
    config: { maxActive: 4, workers: [worker("w1")] },
    createLink: () => {
      const link = createFakeWorker()
      return {
        ...link,
        prompt: (text) => {
          prompts.push(text)
          return link.prompt(text)
        },
      }
    },
  })
  cleanup.push(() => server.close())
  const client = await connect(server.socketPath)
  cleanup.push(() => client.close())
  client.send({
    jsonrpc: "2.0",
    id: 1,
    method: "delegate.start",
    params: { worker: "w1", prompt: "do it", taskId: "t9" },
  })
  await client.next((message) => message.method === "delegate.result")
  expect(prompts).toEqual(["Board task id: t9\ndo it"])
})
