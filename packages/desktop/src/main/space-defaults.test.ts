import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { ensureDefaultSpaces, seedSpace, type SpaceTemplates } from "./space-defaults"
import { listSpaces, spaceDir } from "./spaces"

let root: string
let legacy: string

const templates: SpaceTemplates = {
  personal: { class: "personal", sessionMode: "isolated", color: "#4f8cff" },
  company: { class: "company", sessionMode: "user", color: "#d9822b" },
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-defaults-"))
  legacy = await mkdtemp(join(tmpdir(), "void-legacy-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(legacy, { recursive: true, force: true })
})

async function oldSpace(dir: string, value: unknown) {
  await mkdir(join(legacy, dir), { recursive: true })
  await writeFile(join(legacy, dir, "space.json"), JSON.stringify(value))
}

describe("default spaces", () => {
  test("creates home, void and a work space when the old runtime has no company space", async () => {
    await oldSpace("home", { id: "home", name: "Home", class: "personal", sessionMode: "isolated" })
    await ensureDefaultSpaces(root, templates, legacy)
    const spaces = await listSpaces(root)
    expect(spaces.map((space) => [space.id, space.name, space.class, space.sessionMode])).toEqual([
      ["home", "Home", "personal", "isolated"],
      ["void", "VOID", "personal", "isolated"],
      ["work", "Work", "company", "user"],
    ])
  })

  test("takes the id and name of the work space from the old runtime", async () => {
    await oldSpace("alpha", { id: "alpha-team", name: "Alpha Team", class: "company", sessionMode: "user" })
    await oldSpace("p", { id: "pers", name: "P", class: "personal", sessionMode: "isolated" })
    await ensureDefaultSpaces(root, templates, legacy)
    const spaces = await listSpaces(root)
    expect(spaces.map((space) => space.id)).toEqual(["alpha-team", "home", "void"])
    expect(spaces[0]).toMatchObject({ name: "Alpha Team", class: "company", sessionMode: "user", color: "#d9822b" })
  })

  test("falls back to work when the old runtime file is unusable", async () => {
    await oldSpace("bad", { id: "Bad Id", name: "X", class: "company" })
    await ensureDefaultSpaces(root, templates, join(legacy, "missing"))
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["home", "void", "work"])
  })

  test("is idempotent and does not create a second company space", async () => {
    await oldSpace("a", { id: "alpha", name: "Alpha", class: "company", sessionMode: "user" })
    await ensureDefaultSpaces(root, templates, legacy)
    await oldSpace("a", { id: "beta", name: "Beta", class: "company", sessionMode: "user" })
    await ensureDefaultSpaces(root, templates, legacy)
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["alpha", "home", "void"])
  })

  test("never writes into the old runtime", async () => {
    await oldSpace("a", { id: "alpha", name: "Alpha", class: "company", sessionMode: "user" })
    const before = await readFile(join(legacy, "a", "space.json"), "utf8")
    await ensureDefaultSpaces(root, templates, legacy)
    expect(await readFile(join(legacy, "a", "space.json"), "utf8")).toBe(before)
    expect(existsSync(join(legacy, "alpha"))).toBe(false)
  })
})

describe("space seeder", () => {
  const seed = {
    agents: [{ name: "main", content: "m" }],
    wrapper: "export default 1",
  }

  test("seeds the config dir of the space and keeps the stamps in the space state dir", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", seed)
    const dir = spaceDir(root, "void")
    expect(await readFile(join(dir, "config", "opencode", "agents", "main.md"), "utf8")).toBe("m")
    expect(await readFile(join(dir, "config", "opencode", "provider", "subscription.mjs"), "utf8")).toBe(seed.wrapper)
    expect(existsSync(join(dir, "state", "agents-seeded"))).toBe(true)
    expect(existsSync(join(spaceDir(root, "work"), "config", "opencode"))).toBe(false)
  })

  test("seeds once per space", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", seed)
    const stamp = join(spaceDir(root, "void"), "state", "agents-seeded")
    const first = (await stat(stamp)).mtimeMs
    await seedSpace(root, "void", { ...seed, agents: [{ name: "main", content: "changed" }] })
    expect((await stat(stamp)).mtimeMs).toBe(first)
    expect(await readFile(join(spaceDir(root, "void"), "config", "opencode", "agents", "main.md"), "utf8")).toBe("m")
  })

  test("puts the sign-in plugin and the provider entry into a space without a config", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    const config = '{"provider":{"subscription":{"models":{}}}}'
    await seedSpace(root, "work", { ...seed, plugin: "export default {}", config })
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    expect(await readFile(join(dir, "plugins", "subscription-auth.js"), "utf8")).toBe("export default {}")
    const written = parse(await readFile(join(dir, "opencode.jsonc"), "utf8"))
    expect(written.provider.subscription.models).toEqual({})
  })

  test("seeds the mcp plugin of the subscription provider", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "work", { ...seed, mcpPlugin: "export default {}" })
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    expect(await readFile(join(dir, "plugins", "subscription-mcp.js"), "utf8")).toBe("export default {}")
  })

  test("seeds the shared mcp mapping next to the subscription provider", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "work", { ...seed, mcpMap: "export const mapMcpServers = 1" })
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    expect(await readFile(join(dir, "provider", "mcp-map.mjs"), "utf8")).toBe("export const mapMcpServers = 1")
  })

  test("keeps an existing config", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "opencode.jsonc"), "{}")
    await seedSpace(root, "work", { ...seed, plugin: "p", config: '{"provider":{}}' })
    expect(await readFile(join(dir, "opencode.jsonc"), "utf8")).toBe("{}")
  })

  test("registers the memory server in the config of the space", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", { ...seed, config: "{}", memory: { command: ["bun", "/m/main.ts"], environment: {} } })
    const dir = spaceDir(root, "void")
    const written = parse(await readFile(join(dir, "config", "opencode", "opencode.jsonc"), "utf8"))
    expect(written.mcp.memory.command).toEqual(["bun", "/m/main.ts"])
    expect(written.mcp.memory.environment.VOID_MEMORY_DB).toBe(join(dir, "data", "memory", "graph.db"))
    await seedSpace(root, "work", { ...seed, config: "{}" })
    expect(parse(await readFile(join(spaceDir(root, "work"), "config", "opencode", "opencode.jsonc"), "utf8")).mcp).toBeUndefined()
  })
})

describe("memory plugin seeding", () => {
  test("seedSpace puts the memory plugin shim into the plugins dir of the space", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", { agents: [], wrapper: "w", memoryPlugin: "/src/void-memory/src/plugin.ts" })
    const shim = join(spaceDir(root, "void"), "config", "opencode", "plugins", "void-memory.js")
    expect(await readFile(shim, "utf8")).toContain(join(spaceDir(root, "void"), "data", "memory", "graph.db"))
  })
})

describe("memory permission seeding", () => {
  test("seedSpace adds the memory rules to a worker that predates them", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    const agents = join(spaceDir(root, "void"), "config", "opencode", "agents")
    await mkdir(agents, { recursive: true })
    await writeFile(join(agents, "worker.md"), "---\npermission:\n  bash: allow\n---\nbody\n")
    await seedSpace(root, "void", { agents: [], wrapper: "w" })
    expect(await readFile(join(agents, "worker.md"), "utf8")).toContain("  memory_board_changes: allow\n  delegate: deny\n---\nbody\n")
  })
})

describe("broker seeding", () => {
  const bullet = "- Work for a CLI worker goes through the delegate tool."
  const mainMd = `---\nmode: primary\npermission:\n  bash: allow\n  delegate: allow\n---\n## Delegation\n- first\n${bullet}\n\n## Hard rules\n- x\n`
  const workerMd = "---\nmode: subagent\npermission:\n  bash: allow\n  delegate: deny\n---\nw\n"
  const oldWorkerMd = "---\nmode: subagent\npermission:\n  bash: allow\n  task: deny\n---\nw\n"
  const full = {
    agents: [
      { name: "main", content: mainMd },
      { name: "worker", content: workerMd },
    ],
    wrapper: "w",
    tools: [{ name: "delegate", content: "tool" }],
    workers: JSON.stringify({ maxActive: 4, queueDepth: 4, workers: [{ id: "a", backend: "anthropic-cli" }, { id: "c", backend: "codex" }] }),
  }
  const files = (id: string) => {
    const dir = spaceDir(root, id)
    return {
      workers: join(dir, "config", "broker", "workers.json"),
      tool: join(dir, "config", "opencode", "tools", "delegate.ts"),
      main: join(dir, "config", "opencode", "agents", "main.md"),
      worker: join(dir, "config", "opencode", "agents", "worker.md"),
    }
  }
  const snapshot = async (id: string) => {
    const f = files(id)
    return Promise.all([f.workers, f.tool, f.main, f.worker].map((file) => readFile(file, "utf8")))
  }

  test("a fresh space gets workers.json, the delegate tool and the permission lines", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", full)
    const [workers, tool, main, worker] = await snapshot("void")
    expect(tool).toBe("tool")
    expect(main).toContain("delegate: allow")
    expect(worker).toContain("delegate: deny")
    expect(JSON.parse(workers).queueDepth).toBe(4)
  })

  test("an isolated space points the Anthropic workers at its own login directory", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", full)
    const parsed = JSON.parse(await readFile(files("void").workers, "utf8"))
    expect(parsed.workers[0].account).toBe(join(spaceDir(root, "void"), "cli"))
    expect(parsed.workers[1].account).toBeUndefined()
  })

  test("a user space keeps the account unset", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "work", full)
    expect(JSON.parse(await readFile(files("work").workers, "utf8")).workers[0].account).toBeUndefined()
  })

  test("a second seed changes none of the files and never overwrites edits", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", full)
    const first = await snapshot("void")
    await seedSpace(root, "void", { ...full, workers: "{}", tools: [{ name: "delegate", content: "other" }] })
    expect(await snapshot("void")).toEqual(first)
    await writeFile(files("void").workers, "edited")
    await seedSpace(root, "void", full)
    expect(await readFile(files("void").workers, "utf8")).toBe("edited")
  })

  const stampOld = async (main: string, worker: string) => {
    const f = files("void")
    await mkdir(join(spaceDir(root, "void"), "config", "opencode", "agents"), { recursive: true })
    await mkdir(join(spaceDir(root, "void"), "state"), { recursive: true })
    await writeFile(f.main, main)
    await writeFile(f.worker, worker)
    await writeFile(join(spaceDir(root, "void"), "state", "agents-seeded"), "x")
    await writeFile(join(spaceDir(root, "void"), "state", "memory-seeded-1"), "x")
  }

  test("a profile stamped by the earlier version gets the missing delegate lines once", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await stampOld("---\nmode: primary\npermission:\n  bash: allow\n---\nm\n", oldWorkerMd.replace("bash: allow", "bash: ask"))
    await seedSpace(root, "void", full)
    const worker = await readFile(files("void").worker, "utf8")
    expect(worker).toBe(oldWorkerMd.replace("bash: allow", "bash: ask").replace("  task: deny\n", "  task: deny\n  delegate: deny\n"))
    expect(await readFile(files("void").main, "utf8")).toContain("  bash: allow\n  delegate: allow\n")
    await seedSpace(root, "void", full)
    expect(await readFile(files("void").worker, "utf8")).toBe(worker)
  })

  test("a stamped profile that already has the lines is unchanged", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await stampOld(mainMd, workerMd)
    await seedSpace(root, "void", full)
    expect(await readFile(files("void").worker, "utf8")).toBe(workerMd)
    expect(await readFile(files("void").main, "utf8")).toBe(mainMd)
  })

  const promptOld = "---\nmode: primary\npermission:\n  bash: allow\n  delegate: allow\n---\n## Delegation\n- first\n- mine\n\n## Hard rules\n- x\n"

  test("an old main agent file gets the delegate prompt line once and keeps user edits", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await stampOld(promptOld, workerMd)
    await seedSpace(root, "void", full)
    const main = await readFile(files("void").main, "utf8")
    expect(main).toBe(promptOld.replace("- mine\n", `- mine\n${bullet}\n`))
    await writeFile(files("void").main, main.replace("- first", "- edited"))
    await seedSpace(root, "void", full)
    expect(await readFile(files("void").main, "utf8")).toBe(main.replace("- first", "- edited"))
  })

  test("a main agent file that already has the delegate prompt line is unchanged", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await stampOld(mainMd, workerMd)
    await seedSpace(root, "void", full)
    expect(await readFile(files("void").main, "utf8")).toBe(mainMd)
  })
})
