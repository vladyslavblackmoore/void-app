import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadWorkers } from "../src/workers"
import { failure, tempDir } from "./helpers"

const write = async (value: unknown) => {
  const dir = await tempDir()
  const file = path.join(dir, "config", "broker", "workers.json")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, typeof value === "string" ? value : JSON.stringify(value))
  return file
}

test("loads entries and applies defaults", async () => {
  const file = await write({
    workers: [
      { id: "sub-worker", backend: "anthropic-cli", model: "sonnet", effort: "medium", description: "builds" },
      { id: "codex-worker", backend: "codex" },
    ],
  })
  const config = await loadWorkers(file)
  expect(config.maxActive).toBe(4)
  expect(config.workers).toHaveLength(2)
  expect(config.workers[1]).toMatchObject({
    id: "codex-worker",
    backend: "codex",
    warm: false,
    mcp: [],
    description: "",
  })
})

test("rejects an unknown backend", async () => {
  const file = await write({ workers: [{ id: "a", backend: "other" }] })
  expect(await failure(loadWorkers(file))).toBeInstanceOf(Error)
})

test("rejects duplicate ids", async () => {
  const file = await write({
    workers: [
      { id: "a", backend: "acp" },
      { id: "a", backend: "codex" },
    ],
  })
  expect((await failure(loadWorkers(file)))?.message).toContain("duplicate worker id: a")
})

test("rejects unknown fields", async () => {
  const file = await write({ workers: [{ id: "a", backend: "acp", token: "x" }] })
  expect(await failure(loadWorkers(file))).toBeInstanceOf(Error)
})

test("rejects invalid json and a missing file", async () => {
  expect(await failure(loadWorkers(await write("{")))).toBeInstanceOf(Error)
  expect(await failure(loadWorkers(path.join(await tempDir(), "none.json")))).toBeInstanceOf(Error)
})
