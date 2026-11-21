import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

test("the seeded workers get the memory mcp server", async () => {
  const text = await readFile(join(import.meta.dir, "../../resources/broker/workers.json"), "utf8")
  const parsed = JSON.parse(text) as { workers: Array<{ id: string; mcp: string[] }> }
  expect(parsed.workers.length).toBeGreaterThan(0)
  for (const worker of parsed.workers) expect(worker.mcp).toEqual(["memory"])
})
