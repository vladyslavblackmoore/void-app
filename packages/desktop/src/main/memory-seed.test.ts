import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "jsonc-parser"
import { memoryCommand, memoryPluginFile, seedMemory, seedMemoryPermissions, seedMemoryPlugin } from "./memory-seed"

let space = ""
let configDir = ""

beforeEach(async () => {
  space = await mkdtemp(join(tmpdir(), "void-memory-seed-"))
  configDir = join(space, "config", "opencode")
  await mkdir(configDir, { recursive: true })
})

afterEach(async () => {
  await rm(space, { recursive: true, force: true })
})

const file = () => join(configDir, "opencode.jsonc")
const read = async () => parse(await readFile(file(), "utf8"))

describe("seedMemory", () => {
  test("registers the memory server with the database path of the space", async () => {
    await writeFile(file(), '{ "provider": {} }')
    await seedMemory(space, configDir, { command: ["bun", "/x/main.ts"], environment: {} })
    const config = await read()
    expect(config.provider).toEqual({})
    expect(config.mcp.memory).toEqual({
      type: "local",
      command: ["bun", "/x/main.ts"],
      environment: { VOID_MEMORY_DB: join(space, "data", "memory", "graph.db") },
    })
    expect((await stat(join(space, "data", "memory"))).isDirectory()).toBe(true)
  })

  test("refreshes the command and the path but keeps the other keys", async () => {
    await writeFile(
      file(),
      JSON.stringify({ mcp: { memory: { type: "local", command: ["old"], enabled: false, timeout: 9000, environment: { VOID_MEMORY_DB: "/old", KEEP: "1" } } } }),
    )
    await seedMemory(space, configDir, { command: ["bun", "/new.ts"], environment: {} })
    const config = await read()
    expect(config.mcp.memory.command).toEqual(["bun", "/new.ts"])
    expect(config.mcp.memory.enabled).toBe(false)
    expect(config.mcp.memory.timeout).toBe(9000)
    expect(config.mcp.memory.environment).toEqual({ VOID_MEMORY_DB: join(space, "data", "memory", "graph.db"), KEEP: "1" })
  })

  test("leaves other servers alone and is idempotent", async () => {
    await writeFile(file(), JSON.stringify({ mcp: { other: { type: "local", command: ["x"] } } }))
    await seedMemory(space, configDir, { command: ["bun", "/x.ts"], environment: {} })
    const once = await readFile(file(), "utf8")
    await seedMemory(space, configDir, { command: ["bun", "/x.ts"], environment: {} })
    expect(await readFile(file(), "utf8")).toBe(once)
    expect((await read()).mcp.other).toEqual({ type: "local", command: ["x"] })
  })

  test("does nothing without a command or without a readable config", async () => {
    await writeFile(file(), "{}")
    await seedMemory(space, configDir, undefined)
    expect(await readFile(file(), "utf8")).toBe("{}")
    expect(existsSync(join(space, "data"))).toBe(false)
    await rm(file())
    await seedMemory(space, configDir, { command: ["bun", "/x.ts"], environment: {} })
    expect(existsSync(file())).toBe(false)
    await writeFile(file(), "{ broken")
    await seedMemory(space, configDir, { command: ["bun", "/x.ts"], environment: {} })
    expect(await readFile(file(), "utf8")).toBe("{ broken")
  })
})

describe("memoryCommand", () => {
  test("runs the source with bun in development", () => {
    expect(memoryCommand({ packaged: false, sourceDir: "/repo/packages/void-memory", resourcesPath: "/r", execPath: "/app/VOID" })).toEqual({
      command: ["bun", "/repo/packages/void-memory/src/main.ts"],
      environment: {},
    })
  })

  test("runs the bundled server on the app binary as node when packaged", () => {
    expect(memoryCommand({ packaged: true, sourceDir: "/s", resourcesPath: "/r", execPath: "/app/VOID" })).toEqual({
      command: ["/app/VOID", "/r/void-memory/main.mjs"],
      environment: { ELECTRON_RUN_AS_NODE: "1" },
    })
  })

  test("seeds the node flag next to the database path", async () => {
    await writeFile(file(), "{}")
    await seedMemory(space, configDir, memoryCommand({ packaged: true, sourceDir: "/s", resourcesPath: "/r", execPath: "/app/VOID" }))
    expect((await read()).mcp.memory.environment).toEqual({
      ELECTRON_RUN_AS_NODE: "1",
      VOID_MEMORY_DB: join(space, "data", "memory", "graph.db"),
    })
  })
})

describe("memoryPluginFile", () => {
  test("points at the source in development and at the bundle when packaged", () => {
    expect(memoryPluginFile({ packaged: false, sourceDir: "/s", resourcesPath: "/r" })).toBe("/s/src/plugin.ts")
    expect(memoryPluginFile({ packaged: true, sourceDir: "/s", resourcesPath: "/r" })).toBe("/r/void-memory/plugin.mjs")
  })
})

describe("seedMemoryPlugin", () => {
  test("writes a shim that loads the plugin file by URL with the database path of the space", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory/src/plugin.ts")
    const text = await readFile(join(configDir, "plugins", "void-memory.js"), "utf8")
    expect(text).toContain(JSON.stringify(pathToFileURL("/src/void-memory/src/plugin.ts").href))
    expect(text).toContain(JSON.stringify(join(space, "data", "memory", "graph.db")))
    expect(text).toContain("export default memoryPlugin(")
  })

  test("writes nothing without a plugin file", async () => {
    await seedMemoryPlugin(space, configDir, undefined)
    expect(existsSync(join(configDir, "plugins", "void-memory.js"))).toBe(false)
  })

  test("does not create the database or its directory", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory/src/plugin.ts")
    expect(existsSync(join(space, "data"))).toBe(false)
  })

  test("is idempotent", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory/src/plugin.ts")
    const target = join(configDir, "plugins", "void-memory.js")
    const first = (await stat(target)).mtimeMs
    await new Promise((resolve) => setTimeout(resolve, 20))
    await seedMemoryPlugin(space, configDir, "/src/void-memory/src/plugin.ts")
    expect((await stat(target)).mtimeMs).toBe(first)
  })
})

describe("seedMemoryPermissions", () => {
  const state = () => join(space, "state")
  const agentFile = (name: string) => join(configDir, "agents", `${name}.md`)
  const legacyWorker = [
    "---",
    "description: Does one task.",
    "mode: subagent",
    "permission:",
    "  bash: allow",
    "  edit: allow",
    "  task: deny",
    "---",
    "",
    "You are a worker.",
    "",
  ].join("\n")
  const legacyMain = [
    "---",
    "mode: primary",
    "permission:",
    "  bash: allow",
    "  task:",
    '    "*": allow',
    "---",
    "",
    "## Role",
    "",
  ].join("\n")

  beforeEach(async () => {
    await mkdir(join(configDir, "agents"), { recursive: true })
    await writeFile(agentFile("worker"), legacyWorker)
    await writeFile(agentFile("main"), legacyMain)
  })

  test("adds the memory rules to the permission block of the worker and the main agent", async () => {
    await seedMemoryPermissions(configDir, state())
    const worker = await readFile(agentFile("worker"), "utf8")
    expect(worker).toBe(
      legacyWorker.replace(
        "  task: deny\n",
        [
          "  task: deny",
          '  "memory_*": deny',
          "  memory_remember: allow",
          "  memory_recall: allow",
          "  memory_open: allow",
          "  memory_link: allow",
          "  memory_task_create: allow",
          "  memory_task_claim: allow",
          "  memory_task_update: allow",
          "  memory_task_result: allow",
          "  memory_task_list: allow",
          "  memory_board_changes: allow",
          "",
        ].join("\n"),
      ),
    )
    expect(await readFile(agentFile("main"), "utf8")).toBe(legacyMain.replace('    "*": allow\n', '    "*": allow\n  "memory_*": allow\n'))
  })

  test("keeps a rule the owner already set and adds only the missing ones", async () => {
    await writeFile(agentFile("worker"), legacyWorker.replace("  task: deny\n", "  task: deny\n  memory_recall: deny\n"))
    await seedMemoryPermissions(configDir, state())
    const worker = await readFile(agentFile("worker"), "utf8")
    expect(worker.match(/memory_recall/g)).toHaveLength(1)
    expect(worker).toContain("  memory_recall: deny\n")
    expect(worker).toContain("  memory_remember: allow\n")
    expect(worker).toContain("You are a worker.")
  })

  test("runs once", async () => {
    await seedMemoryPermissions(configDir, state())
    expect(existsSync(join(state(), "memory-seeded-1"))).toBe(true)
    await writeFile(agentFile("worker"), legacyWorker)
    await seedMemoryPermissions(configDir, state())
    expect(await readFile(agentFile("worker"), "utf8")).toBe(legacyWorker)
  })

  test("leaves an agent without a permission block untouched and skips a missing one", async () => {
    await writeFile(agentFile("worker"), "no frontmatter\n")
    await rm(agentFile("main"))
    await seedMemoryPermissions(configDir, state())
    expect(await readFile(agentFile("worker"), "utf8")).toBe("no frontmatter\n")
    expect(existsSync(agentFile("main"))).toBe(false)
    expect(existsSync(join(state(), "memory-seeded-1"))).toBe(true)
  })
})
