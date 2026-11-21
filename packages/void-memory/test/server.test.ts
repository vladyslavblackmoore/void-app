import { afterEach, beforeEach, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createServer } from "../src/server"
import { tempStore } from "./helpers"

let t = tempStore()
let client = new Client({ name: "test", version: "0" })

beforeEach(async () => {
  t = tempStore()
  client = new Client({ name: "test", version: "0" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([createServer(t.store).connect(a), client.connect(b)])
})

afterEach(async () => {
  await client.close()
  t.close()
})

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args })
  const first = Array.isArray(result.content) ? result.content[0] : undefined
  return { isError: result.isError === true, data: first?.type === "text" ? first.text : "" }
}

test("the server lists its memory tools and instructions", async () => {
  const names = (await client.listTools()).tools.map((tool) => tool.name)
  for (const name of ["remember", "recall", "open", "link", "forget"]) expect(names).toContain(name)
  expect(client.getInstructions()).toContain("supersedes")
})

test("remember then recall through the mcp layer", async () => {
  const written = await call("remember", {
    nodes: [{ id: "d1", kind: "decision", title: "Использовать очередь A", body: "ёмкость выше" }],
    agent: "main",
  })
  expect(written.isError).toBe(false)
  const found = await call("recall", { query: "емкость", hops: 0 })
  expect(JSON.parse(found.data).nodes[0].id).toBe("d1")
  await call("forget", { ids: ["d1"] })
  expect(JSON.parse((await call("recall", { query: "очередь" })).data).nodes).toEqual([])
  expect(JSON.parse((await call("recall", { query: "очередь", history: true })).data).nodes).toHaveLength(1)
})

test("a tool error is reported as an error result", async () => {
  const result = await call("link", { src: "a", dst: "b", type: "relates_to" })
  expect(result.isError).toBe(true)
  expect(result.data).toContain("unknown node")
})
