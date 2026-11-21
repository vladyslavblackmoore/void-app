import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { memoryCommand, seedMemory, seedMemoryPlugin } from "./memory-seed"

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
    await seedMemory(space, configDir, ["bun", "/x/main.ts"])
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
    await seedMemory(space, configDir, ["bun", "/new.ts"])
    const config = await read()
    expect(config.mcp.memory.command).toEqual(["bun", "/new.ts"])
    expect(config.mcp.memory.enabled).toBe(false)
    expect(config.mcp.memory.timeout).toBe(9000)
    expect(config.mcp.memory.environment).toEqual({ VOID_MEMORY_DB: join(space, "data", "memory", "graph.db"), KEEP: "1" })
  })

  test("leaves other servers alone and is idempotent", async () => {
    await writeFile(file(), JSON.stringify({ mcp: { other: { type: "local", command: ["x"] } } }))
    await seedMemory(space, configDir, ["bun", "/x.ts"])
    const once = await readFile(file(), "utf8")
    await seedMemory(space, configDir, ["bun", "/x.ts"])
    expect(await readFile(file(), "utf8")).toBe(once)
    expect((await read()).mcp.other).toEqual({ type: "local", command: ["x"] })
  })

  test("does nothing without a command or without a readable config", async () => {
    await writeFile(file(), "{}")
    await seedMemory(space, configDir, undefined)
    expect(await readFile(file(), "utf8")).toBe("{}")
    expect(existsSync(join(space, "data"))).toBe(false)
    await rm(file())
    await seedMemory(space, configDir, ["bun", "/x.ts"])
    expect(existsSync(file())).toBe(false)
    await writeFile(file(), "{ broken")
    await seedMemory(space, configDir, ["bun", "/x.ts"])
    expect(await readFile(file(), "utf8")).toBe("{ broken")
  })
})

describe("memoryCommand", () => {
  test("runs the source with bun in development", () => {
    expect(memoryCommand({ packaged: false, sourceDir: "/repo/packages/void-memory", resourcesPath: "/r", exists: () => false })).toEqual([
      "bun",
      "/repo/packages/void-memory/src/main.ts",
    ])
  })

  test("uses the bundled binary when packaged and present", () => {
    const exists = (path: string) => path === "/r/void-memory/void-memory"
    expect(memoryCommand({ packaged: true, sourceDir: "/s", resourcesPath: "/r", exists })).toEqual(["/r/void-memory/void-memory"])
  })

  test("returns nothing when packaged without the binary", () => {
    expect(memoryCommand({ packaged: true, sourceDir: "/s", resourcesPath: "/r", exists: () => false })).toBeUndefined()
  })
})

describe("seedMemoryPlugin", () => {
  test("writes a shim that loads the plugin source with the database path of the space", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory")
    const text = await readFile(join(configDir, "plugins", "void-memory.js"), "utf8")
    expect(text).toContain(JSON.stringify("/src/void-memory/src/plugin.ts"))
    expect(text).toContain(JSON.stringify(join(space, "data", "memory", "graph.db")))
    expect(text).toContain("export default memoryPlugin(")
  })

  test("writes nothing without a source directory", async () => {
    await seedMemoryPlugin(space, configDir, undefined)
    expect(existsSync(join(configDir, "plugins", "void-memory.js"))).toBe(false)
  })

  test("does not create the database or its directory", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory")
    expect(existsSync(join(space, "data"))).toBe(false)
  })

  test("is idempotent", async () => {
    await seedMemoryPlugin(space, configDir, "/src/void-memory")
    const target = join(configDir, "plugins", "void-memory.js")
    const first = (await stat(target)).mtimeMs
    await new Promise((resolve) => setTimeout(resolve, 20))
    await seedMemoryPlugin(space, configDir, "/src/void-memory")
    expect((await stat(target)).mtimeMs).toBe(first)
  })
})
