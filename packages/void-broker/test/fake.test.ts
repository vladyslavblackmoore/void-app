import { expect, test } from "bun:test"
import { failure } from "./helpers"
import { createFakeWorker } from "../src/fake"
import type { WorkerEvent } from "../src/types"

const collect = async (stream: AsyncIterable<WorkerEvent>) => {
  const out: WorkerEvent[] = []
  for await (const event of stream) out.push(event)
  return out
}

test("streams chunks and ends in one result", async () => {
  const link = createFakeWorker({ chunks: ["a", "b"] })
  await link.start()
  const events = await collect(link.prompt("hi"))
  expect(events.map((event) => event.type)).toEqual(["event", "event", "result"])
  const last = events[2]
  expect(last).toMatchObject({ type: "result", stopReason: "end_turn", text: "ab" })
})

test("cancel ends the run as cancelled", async () => {
  const link = createFakeWorker({ chunks: ["a", "b", "c"], delayMs: 50 })
  await link.start()
  const pending = collect(link.prompt("hi"))
  await link.cancel()
  const events = await pending
  expect(events.at(-1)).toMatchObject({ type: "result", stopReason: "cancelled" })
})

test("prompt before start fails and health follows the lifecycle", async () => {
  const link = createFakeWorker()
  expect((await link.health()).ok).toBe(false)
  expect(await failure(collect(link.prompt("x")))).toBeInstanceOf(Error)
  await link.start()
  expect((await link.health()).ok).toBe(true)
  await link.close()
  expect((await link.health()).ok).toBe(false)
})
