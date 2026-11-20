import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { seedAgents } from "./agents"

const agents = [
  { name: "main", content: "main prompt" },
  { name: "worker", content: "worker prompt" },
]

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "void-agents-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("seedAgents", () => {
  test("writes the bundled agents and makes main the default in an empty config dir", async () => {
    await seedAgents(dir, agents)

    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("main prompt")
    expect(await readFile(join(dir, "agents", "worker.md"), "utf8")).toBe("worker prompt")
    expect(JSON.parse(await readFile(join(dir, "config.json"), "utf8")).default_agent).toBe("main")
  })

  test("keeps files the user already has", async () => {
    await mkdir(join(dir, "agents"), { recursive: true })
    await writeFile(join(dir, "agents", "main.md"), "edited")
    await writeFile(join(dir, "config.json"), '{ "default_agent": "build" }')

    await seedAgents(dir, agents)

    expect(await readFile(join(dir, "agents", "main.md"), "utf8")).toBe("edited")
    expect(await readFile(join(dir, "agents", "worker.md"), "utf8")).toBe("worker prompt")
    expect(await readFile(join(dir, "config.json"), "utf8")).toBe('{ "default_agent": "build" }')
  })

  test("skips an agent the user keeps in the singular agent dir", async () => {
    await mkdir(join(dir, "agent"), { recursive: true })
    await writeFile(join(dir, "agent", "worker.md"), "own worker")

    await seedAgents(dir, agents)

    expect(await Bun.file(join(dir, "agents", "worker.md")).exists()).toBe(false)
    expect(await readFile(join(dir, "agent", "worker.md"), "utf8")).toBe("own worker")
  })
})
