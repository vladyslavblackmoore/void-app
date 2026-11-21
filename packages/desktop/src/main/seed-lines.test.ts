import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addMissingLines } from "./seed-lines"

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "void-lines-"))
  file = join(dir, "worker.md")
})

afterEach(() => rm(dir, { recursive: true, force: true }))

const old = "---\ndescription: d\npermission:\n  bash: allow\n  task: deny\nmode: subagent\n---\n\nbody\n"
const base = { stateDir: join(tmpdir(), "unused"), name: "delegate", version: 1, lines: ["delegate: deny"], section: "permission" }
const run = (extra: Partial<Parameters<typeof addMissingLines>[0]> = {}) =>
  addMissingLines({ ...base, file, stateDir: join(dir, "state"), ...extra })

describe("addMissingLines", () => {
  test("adds the missing line to the end of the section and keeps everything else", async () => {
    await writeFile(file, old)
    expect(await run()).toBe(true)
    expect(await readFile(file, "utf8")).toBe(old.replace("  task: deny\n", "  task: deny\n  delegate: deny\n"))
  })

  test("runs once per version stamp", async () => {
    await writeFile(file, old)
    await run()
    const first = await readFile(file, "utf8")
    await writeFile(file, old)
    expect(await run()).toBe(false)
    expect(await readFile(file, "utf8")).toBe(old)
    expect(first).not.toBe(old)
  })

  test("a new version runs again", async () => {
    await writeFile(file, old)
    await run()
    expect(await run({ version: 2, lines: ["edit: allow"] })).toBe(true)
    expect(await readFile(file, "utf8")).toContain("  edit: allow\n")
  })

  test("leaves a file that already has the key unchanged, even with another value", async () => {
    const edited = old.replace("task: deny", "delegate: allow")
    await writeFile(file, edited)
    expect(await run()).toBe(false)
    expect(await readFile(file, "utf8")).toBe(edited)
  })

  test("does nothing when the file or the section is missing", async () => {
    expect(await run()).toBe(false)
    await writeFile(file, "---\ndescription: d\n---\nbody\n")
    expect(await run()).toBe(false)
    expect(await readFile(file, "utf8")).toBe("---\ndescription: d\n---\nbody\n")
  })

  test("keeps CRLF line endings", async () => {
    await writeFile(file, old.replaceAll("\n", "\r\n"))
    await run()
    expect(await readFile(file, "utf8")).toBe(old.replace("  task: deny\n", "  task: deny\n  delegate: deny\n").replaceAll("\n", "\r\n"))
  })

  test("appends to the end of the file without a section", async () => {
    await writeFile(file, "a\nb\n")
    await run({ section: undefined, lines: ["b", "c"] })
    expect(await readFile(file, "utf8")).toBe("a\nb\nc\n")
  })

  describe("under a body heading", () => {
    const doc = "---\nmode: primary\n---\n\n## Role\nr\n\n## Delegation\n- one\n- two\n\n## Hard rules\n- x\n"
    const bullet = "- Use the delegate tool for CLI workers."
    const body = { section: undefined, heading: "Delegation", lines: [bullet], name: "prompt" }

    test("adds the bullet at the end of the heading section and keeps the rest", async () => {
      await writeFile(file, doc)
      expect(await run(body)).toBe(true)
      expect(await readFile(file, "utf8")).toBe(doc.replace("- two\n", `- two\n${bullet}\n`))
    })

    test("adds it once per stamp", async () => {
      await writeFile(file, doc)
      await run(body)
      const first = await readFile(file, "utf8")
      expect(await run(body)).toBe(false)
      expect(await readFile(file, "utf8")).toBe(first)
    })

    test("leaves a file that already has the line unchanged", async () => {
      const has = doc.replace("- two\n", `- two\n${bullet}\n`)
      await writeFile(file, has)
      expect(await run(body)).toBe(false)
      expect(await readFile(file, "utf8")).toBe(has)
    })

    test("leaves a file with the marker text in another wording unchanged", async () => {
      const has = doc.replace("- two", "- route CLI work through the delegate tool")
      await writeFile(file, has)
      expect(await run({ ...body, marker: "delegate tool" })).toBe(false)
      expect(await readFile(file, "utf8")).toBe(has)
    })

    test("does nothing when the heading is missing", async () => {
      await writeFile(file, "---\nmode: primary\n---\n\n## Role\nr\n")
      expect(await run(body)).toBe(false)
    })
  })
})
