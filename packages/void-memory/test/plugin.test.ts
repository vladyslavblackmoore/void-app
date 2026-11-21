import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Hooks } from "@opencode-ai/plugin"
import { compactionInstruction, memoryPlugin, recallCap } from "../src/plugin"
import { tempStore } from "./helpers"

let t = tempStore()

beforeEach(() => {
  t = tempStore()
})

afterEach(() => {
  t.close()
})

const load = async (path: string): Promise<Hooks> => {
  const module = memoryPlugin(path)
  return module.server({} as never)
}

const model = {} as never

test("the plugin module has an id and a server", () => {
  const module = memoryPlugin("/nowhere/graph.db")
  expect(typeof module.id).toBe("string")
  expect(typeof module.server).toBe("function")
})

test("the system transform adds nothing for an empty database", async () => {
  const hooks = await load(t.path)
  const output = { system: ["base"] }
  await hooks["experimental.chat.system.transform"]!({ sessionID: "s", model }, output)
  expect(output.system).toEqual(["base"])
})

test("the system transform adds nothing and creates nothing when the file is absent", async () => {
  const path = join(dirname(t.path), "missing", "graph.db")
  const hooks = await load(path)
  const output = { system: ["base"] }
  await hooks["experimental.chat.system.transform"]!({ sessionID: "s", model }, output)
  expect(output.system).toEqual(["base"])
  expect(existsSync(path)).toBe(false)
  expect(existsSync(dirname(path))).toBe(false)
})

test("the system transform appends one capped block when memory has a pinned node", async () => {
  t.store.remember(
    { nodes: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, kind: "fact", title: `Факт ${i}`, body: "т".repeat(500), props: { pinned: true } })) },
    { agent: "main" },
  )
  const hooks = await load(t.path)
  const output = { system: ["base"] }
  await hooks["experimental.chat.system.transform"]!({ sessionID: "s", model }, output)
  expect(output.system.length).toBe(2)
  expect(output.system[0]).toBe("base")
  expect(output.system[1].length).toBeLessThanOrEqual(recallCap)
  expect(output.system[1]).toContain("Факт 39")
})

test("the system transform does not throw on a broken database", async () => {
  await Bun.write(t.path + ".bad", "junk")
  const hooks = await load(t.path + ".bad")
  const output = { system: ["base"] }
  await hooks["experimental.chat.system.transform"]!({ sessionID: "s", model }, output)
  expect(output.system).toEqual(["base"])
})

test("the compaction hook adds the save-durable-facts instruction", async () => {
  const hooks = await load(t.path)
  const output: { context: string[]; prompt?: string } = { context: [], prompt: undefined }
  await hooks["experimental.session.compacting"]!({ sessionID: "s" }, output)
  expect(output.context).toEqual([compactionInstruction])
  expect(output.prompt).toBeUndefined()
  expect(compactionInstruction).toContain("memory_remember")
})

test("the compaction hook works when the database is absent", async () => {
  const hooks = await load(join(dirname(t.path), "missing", "graph.db"))
  const output: { context: string[]; prompt?: string } = { context: ["x"] }
  await hooks["experimental.session.compacting"]!({ sessionID: "s" }, output)
  expect(output.context.length).toBe(2)
})

test("the plugin exposes no write hooks beyond the two", async () => {
  const hooks = await load(t.path)
  expect(Object.keys(hooks).sort()).toEqual(["experimental.chat.system.transform", "experimental.session.compacting"])
})
