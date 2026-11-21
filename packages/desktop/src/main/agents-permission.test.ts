import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigMarkdown } from "../../../core/src/config/markdown"
import { Permission } from "../../../opencode/src/permission"
import { toolName } from "../../../opencode/src/mcp/catalog"

const agents = join(import.meta.dir, "../../resources/agents")

async function ruleset(name: string) {
  const parsed = ConfigMarkdown.parse(await readFile(join(agents, `${name}.md`), "utf8"))
  return [...Permission.fromConfig({ "*": "allow" }), ...Permission.fromConfig(parsed.data.permission)]
}

async function memoryTools() {
  const entry = join(import.meta.dir, "../../../void-memory/src/main.ts")
  const dir = await mkdtemp(join(tmpdir(), "void-memory-tools-"))
  const proc = Bun.spawn(["bun", entry], {
    env: { ...process.env, VOID_MEMORY_DB: join(dir, "graph.db") },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  })
  const send = (message: object) => proc.stdin.write(JSON.stringify(message) + "\n")
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } } })
  send({ jsonrpc: "2.0", method: "notifications/initialized" })
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
  proc.stdin.flush()
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let tools: string[] | undefined
  while (tools === undefined) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value)
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("{")) continue
      const message = JSON.parse(line) as { id?: number; result?: { tools: Array<{ name: string }> } }
      if (message.id === 2) tools = message.result!.tools.map((tool) => toolName("memory", tool.name))
    }
  }
  proc.kill()
  await rm(dir, { recursive: true, force: true })
  return tools ?? []
}

describe("memory tool permissions in the seeded agents", () => {
  test("the server exposes eleven tools including memory_forget", async () => {
    const tools = await memoryTools()
    expect(tools).toHaveLength(11)
    expect(tools).toContain("memory_forget")
    expect(tools).toContain("memory_task_claim")
  })

  test("main keeps every memory tool", async () => {
    const tools = await memoryTools()
    expect(Permission.disabled(tools, await ruleset("main"))).toEqual(new Set())
    expect(Permission.evaluate("memory_forget", "*", await ruleset("main")).action).toBe("allow")
  })

  test("a worker loses only memory_forget", async () => {
    const tools = await memoryTools()
    const rules = await ruleset("worker")
    expect(Permission.disabled(tools, rules)).toEqual(new Set(["memory_forget"]))
    expect(Object.keys(Permission.visibleTools(Object.fromEntries(tools.map((tool) => [tool, 1])), rules))).toHaveLength(10)
    for (const tool of tools.filter((tool) => tool !== "memory_forget"))
      expect(Permission.evaluate(tool, "*", rules).action).toBe("allow")
  })
})
