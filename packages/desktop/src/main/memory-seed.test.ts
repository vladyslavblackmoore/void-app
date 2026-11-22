import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryDir, seedMemory } from "./memory-seed"

const templates = {
  index: "# Memory\n",
  tasks: "# Tasks\n\n## Open\n\n## Done\n",
  rules: "# Rules\n",
}

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-memory-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("seedMemory", () => {
  test("lives under the void home", () => {
    expect(memoryDir("/x/void")).toBe(join("/x/void", "memory"))
  })

  test("creates the files and folders in an empty root", async () => {
    await seedMemory(root, templates)

    const dir = memoryDir(root)
    expect(await readFile(join(dir, "MEMORY.md"), "utf8")).toBe(templates.index)
    expect(await readFile(join(dir, "tasks.md"), "utf8")).toBe(templates.tasks)
    expect(await readFile(join(dir, "RULES.md"), "utf8")).toBe(templates.rules)
    expect((await stat(join(dir, "facts"))).isDirectory()).toBe(true)
    expect((await stat(join(dir, "journal"))).isDirectory()).toBe(true)
  })

  test("leaves existing files and folders untouched", async () => {
    const dir = memoryDir(root)
    await mkdir(join(dir, "facts"), { recursive: true })
    await writeFile(join(dir, "MEMORY.md"), "mine")
    await writeFile(join(dir, "facts", "a.md"), "fact")
    await writeFile(join(dir, "RULES.md"), "my rules")

    await seedMemory(root, templates)
    await seedMemory(root, templates)

    expect(await readFile(join(dir, "MEMORY.md"), "utf8")).toBe("mine")
    expect(await readFile(join(dir, "RULES.md"), "utf8")).toBe("my rules")
    expect(await readFile(join(dir, "tasks.md"), "utf8")).toBe(templates.tasks)
    expect(await readdir(join(dir, "facts"))).toEqual(["a.md"])
  })
})

describe("bundled memory templates", () => {
  const read = (name: string) => readFile(join(import.meta.dir, "..", "..", "resources", "memory", name), "utf8")

  test("rules describe the memory protocol", async () => {
    const rules = await read("RULES.md")
    expect(rules).toContain("~/void/memory")
    expect(rules).toContain("facts/<slug>.md")
    expect(rules).toContain("journal/<YYYY-MM-DD>.md")
    expect(rules).toContain("remember")
  })

  test("tasks has Open and Done sections and the index is a header", async () => {
    const tasks = await read("tasks.md")
    expect(tasks).toContain("## Open")
    expect(tasks).toContain("## Done")
    expect(await read("MEMORY.md")).toContain("facts/<slug>.md")
  })
})
