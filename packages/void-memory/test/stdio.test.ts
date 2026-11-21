import { expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("the stdio server process answers remember then recall", async () => {
  const dir = mkdtempSync(join(tmpdir(), "void-memory-stdio-"))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dir, "../src/main.ts")],
    env: { PATH: process.env.PATH ?? "", VOID_MEMORY_DB: join(dir, "graph.db") },
    stderr: "pipe",
  })
  const client = new Client({ name: "stdio-test", version: "0" })
  await client.connect(transport)
  const written = await client.callTool({
    name: "remember",
    arguments: { nodes: [{ id: "n1", kind: "fact", title: "Очередь задач", body: "ёмкость очереди" }], agent: "main" },
  })
  expect(written.isError).not.toBe(true)
  const found = await client.callTool({ name: "recall", arguments: { query: "емкость", hops: 0 } })
  const first = Array.isArray(found.content) ? found.content[0] : undefined
  expect(first?.type === "text" ? JSON.parse(first.text).nodes[0].id : "").toBe("n1")
  await client.close()
  rmSync(dir, { recursive: true, force: true })
}, 15000)
