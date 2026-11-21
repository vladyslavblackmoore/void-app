import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { seedAgents, seedTools } from "./agents"

const agents = [
  { name: "main", content: "main prompt" },
  { name: "worker", content: "worker prompt" },
]

const roles = [
  { name: "architect", content: "architect prompt", version: 2 },
  { name: "doc", content: "doc prompt", version: 2 },
]

let dir = ""
let data = ""

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "void-agents-"))
  data = await mkdtemp(join(tmpdir(), "void-userdata-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})

describe("seedAgents", () => {
  test("writes the bundled agents and makes main the default in an empty config dir", async () => {
    await seedAgents(dir, data, agents)

    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("main prompt")
    expect(await readFile(join(dir, "agents", "worker.md"), "utf8")).toBe("worker prompt")
    expect(JSON.parse(await readFile(join(dir, "config.json"), "utf8")).default_agent).toBe("main")
  })

  test("keeps files the user already has", async () => {
    await mkdir(join(dir, "agents"), { recursive: true })
    await writeFile(join(dir, "agents", "main.md"), "edited")
    await writeFile(join(dir, "config.json"), '{ "default_agent": "build" }')

    await seedAgents(dir, data, agents)

    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("edited")
    expect(await readFile(join(dir, "agents", "worker.md"), "utf8")).toBe("worker prompt")
    expect(await readFile(join(dir, "config.json"), "utf8")).toBe('{ "default_agent": "build" }')
  })

  test("skips an agent the user keeps in the singular agent dir", async () => {
    await mkdir(join(dir, "agent"), { recursive: true })
    await writeFile(join(dir, "agent", "worker.md"), "own worker")

    await seedAgents(dir, data, agents)

    expect(await Bun.file(join(dir, "agents", "worker.md")).exists()).toBe(false)
    expect(await readFile(join(dir, "agent", "worker.md"), "utf8")).toBe("own worker")
  })

  test("seeds only once: a deleted agent and config stay deleted on the next launch", async () => {
    await seedAgents(dir, data, agents)
    await rm(join(dir, "agents", "main.md"))
    await rm(join(dir, "config.json"))

    await seedAgents(dir, data, agents)

    expect(await Bun.file(join(dir, "agents", "main.md")).exists()).toBe(false)
    expect(await Bun.file(join(dir, "config.json")).exists()).toBe(false)
  })

  test("does not touch an edited config.json on later launches", async () => {
    await seedAgents(dir, data, agents)
    await writeFile(join(dir, "config.json"), '{ "default_agent": "build" }')

    await seedAgents(dir, data, agents)

    expect(await readFile(join(dir, "config.json"), "utf8")).toBe('{ "default_agent": "build" }')
  })

  test("leaves no stamp and no config.json when an agent write fails, so the next launch retries", async () => {
    await writeFile(join(dir, "agents"), "not a directory")

    await expect(seedAgents(dir, data, agents)).rejects.toThrow()

    expect(await readdir(data)).toEqual([])
    expect(await Bun.file(join(dir, "config.json")).exists()).toBe(false)

    await rm(join(dir, "agents"))
    await seedAgents(dir, data, agents)

    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("main prompt")
  })
})

describe("seedAgents versions", () => {
  const all = [...agents, ...roles]
  const names = async () => (await readdir(join(dir, "agents"))).sort()

  test("a fresh profile gets every file and both stamps", async () => {
    await seedAgents(dir, data, all)

    expect(await names()).toEqual(["architect.md", "doc.md", "main.md", "worker.md"])
    expect((await readdir(data)).sort()).toEqual(["agents-seeded", "agents-seeded-2"])
  })

  const oldProfile = async () => {
    await seedAgents(dir, data, agents)
    await rm(join(data, "agents-seeded-2"))
  }

  test("a profile stamped by version 1 gets the new roles and nothing else", async () => {
    await oldProfile()
    await rm(join(dir, "agents", "worker.md"))
    await writeFile(join(dir, "agents", "main.md"), "edited")
    const config = await readFile(join(dir, "config.json"), "utf8")

    await seedAgents(dir, data, all)

    expect(await names()).toEqual(["architect.md", "doc.md", "main.md"])
    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("edited")
    expect(await readFile(join(dir, "config.json"), "utf8")).toBe(config)
    expect(await readFile(join(dir, "agents", "architect.md"), "utf8")).toBe("architect prompt")
  })

  test("an existing role file is not overwritten when the roles are seeded", async () => {
    await oldProfile()
    await writeFile(join(dir, "agents", "doc.md"), "own doc")

    await seedAgents(dir, data, all)

    expect(await readFile(join(dir, "agents", "doc.md"), "utf8")).toBe("own doc")
    expect(await readFile(join(dir, "agents", "architect.md"), "utf8")).toBe("architect prompt")
  })

  test("a second start changes nothing", async () => {
    await seedAgents(dir, data, all)
    await rm(join(dir, "agents", "doc.md"))
    await writeFile(join(dir, "agents", "architect.md"), "edited")

    await seedAgents(dir, data, all)

    expect(await names()).toEqual(["architect.md", "main.md", "worker.md"])
    expect(await readFile(join(dir, "agents", "architect.md"), "utf8")).toBe("edited")
  })
})

describe("bundled agents", () => {
  const permission = async (name: string) => {
    const text = await readFile(join(import.meta.dir, "../../resources/agents", `${name}.md`), "utf8")
    return Bun.YAML.parse(text.split("---")[1]) as { permission: Record<string, unknown> }
  }

  test("main runs commands, edits and calls any subagent without asking", async () => {
    expect((await permission("main")).permission).toMatchObject({
      bash: "allow",
      edit: "allow",
      question: "allow",
      delegate: "allow",
      task: { "*": "allow" },
    })
  })

  test("the role files carry no model or variant", async () => {
    for (const name of ["architect", "doc", "explorer"]) {
      const text = await readFile(join(import.meta.dir, "../../resources/agents", `${name}.md`), "utf8")
      const front = Bun.YAML.parse(text.split("---")[1]) as Record<string, unknown>
      expect(front.mode).toBe("subagent")
      expect(typeof front.description).toBe("string")
      expect(front.model).toBeUndefined()
      expect(front.variant).toBeUndefined()
    }
  })

  test("worker runs commands and edits without asking and starts no tasks", async () => {
    expect((await permission("worker")).permission).toMatchObject({ bash: "allow", edit: "allow", task: "deny", delegate: "deny" })
  })
})

const tools = [{ name: "delegate", content: "tool source" }]

describe("seedTools", () => {
  test("writes tools/delegate.ts once and never overwrites it", async () => {
    await seedTools(dir, data, tools)
    expect(await readFile(join(dir, "tools", "delegate.ts"), "utf8")).toBe("tool source")

    await writeFile(join(dir, "tools", "delegate.ts"), "edited")
    await rm(join(data, "tools-seeded"))
    await seedTools(dir, data, [{ name: "delegate", content: "newer source" }])
    expect(await readFile(join(dir, "tools", "delegate.ts"), "utf8")).toBe("edited")
  })

  test("does nothing after the stamp exists", async () => {
    await seedTools(dir, data, tools)
    await rm(join(dir, "tools", "delegate.ts"))

    await seedTools(dir, data, tools)

    expect(await Bun.file(join(dir, "tools", "delegate.ts")).exists()).toBe(false)
  })

  test("seeds the tool in a config dir that already has agents", async () => {
    await seedAgents(dir, data, agents)
    await seedTools(dir, data, tools)
    expect(await readdir(join(dir, "tools"))).toEqual(["delegate.ts"])
  })
})
