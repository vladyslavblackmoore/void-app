import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const runtime = process.env.SMOKE_RUNTIME ?? "node"
const entry = process.env.SMOKE_ENTRY ?? join(import.meta.dir, "../dist/main.js")
const dir = mkdtempSync(join(tmpdir(), "void-memory-smoke-"))
const transport = new StdioClientTransport({
  command: runtime,
  args: [entry],
  env: { PATH: process.env.PATH ?? "", VOID_MEMORY_DB: join(dir, "graph.db") },
  stderr: "inherit",
})
const client = new Client({ name: "smoke", version: "0" })
const fail = (message: string): never => {
  console.error(`smoke failed: ${message}`)
  process.exit(1)
}
try {
  await client.connect(transport)
  const tools = (await client.listTools()).tools.map((tool) => tool.name)
  console.log(`runtime=${runtime} entry=${entry}`)
  console.log(`tools=${tools.join(",")}`)
  const written = await client.callTool({
    name: "remember",
    arguments: { nodes: [{ id: "n1", kind: "fact", title: "Очередь задач", body: "ёмкость очереди" }], agent: "main" },
  })
  if (written.isError === true) fail("remember returned an error")
  const found = await client.callTool({ name: "recall", arguments: { query: "емкость", hops: 0 } })
  const first = Array.isArray(found.content) ? found.content[0] : undefined
  const id = first?.type === "text" ? JSON.parse(first.text).nodes[0]?.id : undefined
  if (id !== "n1") fail(`recall returned ${String(id)}`)
  const claimed = await client.callTool({ name: "task_create", arguments: { id: "t1", title: "smoke task", agent: "main" } })
  if (claimed.isError === true) fail("task_create returned an error")
  console.log("smoke ok: remember, recall (FTS5 yo-fold), task_create")
} finally {
  await client.close()
  rmSync(dir, { recursive: true, force: true })
}
