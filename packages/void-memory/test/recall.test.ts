import { afterEach, beforeEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { recallBlock, recallBlockFromFile } from "../src/recall"
import { tempStore } from "./helpers"

let t = tempStore()

beforeEach(() => {
  t = tempStore()
})

afterEach(() => {
  t.close()
})

const long = "Очередь задач читает воркер по расписанию и пишет результат в журнал. ".repeat(20)

test("an empty database gives no block", () => {
  expect(recallBlock(t.db, { cap: 1500 })).toBeUndefined()
})

test("unpinned memory and finished tasks give no block", () => {
  t.store.remember({ nodes: [{ id: "f1", kind: "fact", title: "plain", body: "not pinned" }] }, { agent: "main" })
  const task = t.store.task.create({ title: "done soon" }, { agent: "main" })
  t.store.task.result({ id: task.id, result: "ok" }, { agent: "main" })
  expect(recallBlock(t.db, { cap: 1500 })).toBeUndefined()
})

test("a pinned node and an open task appear", () => {
  t.store.remember(
    { nodes: [{ id: "f1", kind: "decision", title: "Use queue A", body: "Because of ordering", props: { pinned: true } }] },
    { agent: "main" },
  )
  t.store.task.create({ title: "Write the report", brief: "details" }, { agent: "main" })
  const block = recallBlock(t.db, { cap: 1500 })
  expect(block).toContain("Use queue A")
  expect(block).toContain("Write the report")
  expect(block?.startsWith("<memory>")).toBe(true)
  expect(block?.endsWith("</memory>")).toBe(true)
})

test("invalidated pinned nodes are skipped", () => {
  t.store.remember({ nodes: [{ id: "f1", kind: "fact", title: "old", props: { pinned: true } }] }, { agent: "main" })
  t.db.run("update node set invalidated_at = 1 where id = 'f1'")
  expect(recallBlock(t.db, { cap: 1500 })).toBeUndefined()
})

test("the block never exceeds the cap with many long multibyte items", () => {
  t.store.remember(
    {
      nodes: Array.from({ length: 60 }, (_, i) => ({
        id: `p${i}`,
        kind: "fact",
        title: `Закреплённый факт ${i} 😀`,
        body: long,
        props: { pinned: true },
      })),
    },
    { agent: "main" },
  )
  for (let i = 0; i < 60; i++) t.store.task.create({ title: `Задача ${i} 😀`, brief: long }, { agent: "main" })
  for (const cap of [1500, 400, 120, 60]) {
    const block = recallBlock(t.db, { cap })
    if (block === undefined) continue
    expect(block.length).toBeLessThanOrEqual(cap)
    expect(block.startsWith("<memory>")).toBe(true)
    expect(block.endsWith("</memory>")).toBe(true)
    expect(block.isWellFormed()).toBe(true)
  }
  const block = recallBlock(t.db, { cap: 1500 })
  expect(block).toBeDefined()
  expect(block!.length).toBeLessThanOrEqual(1500)
  expect(block!.length).toBeGreaterThan(1000)
})

test("a cap too small for the frame gives no block", () => {
  t.store.remember({ nodes: [{ id: "f1", kind: "fact", title: "x", props: { pinned: true } }] }, { agent: "main" })
  expect(recallBlock(t.db, { cap: 5 })).toBeUndefined()
})

test("agent scoped memory is shown only to its agent", () => {
  t.store.remember(
    { nodes: [{ id: "s1", kind: "fact", title: "secret of worker", scope: "agent:worker", props: { pinned: true } }] },
    { agent: "worker" },
  )
  expect(recallBlock(t.db, { cap: 1500 })).toBeUndefined()
  expect(recallBlock(t.db, { cap: 1500, agent: "main" })).toBeUndefined()
  expect(recallBlock(t.db, { cap: 1500, agent: "worker" })).toContain("secret of worker")
})

test("claimed tasks of other agents are hidden when the agent is known", () => {
  const a = t.store.task.create({ title: "mine" }, { agent: "main" })
  const b = t.store.task.create({ title: "theirs" }, { agent: "main" })
  t.store.task.claim(a.id, { agent: "worker" })
  t.store.task.claim(b.id, { agent: "other" })
  const block = recallBlock(t.db, { cap: 1500, agent: "worker" })
  expect(block).toContain("mine")
  expect(block).not.toContain("theirs")
  expect(recallBlock(t.db, { cap: 1500 })).toContain("theirs")
})

test("a missing database file gives no block and is not created", () => {
  const path = join(dirname(t.path), "absent", "graph.db")
  expect(recallBlockFromFile(path, { cap: 1500 })).toBeUndefined()
  expect(existsSync(path)).toBe(false)
  expect(existsSync(dirname(path))).toBe(false)
})

test("a garbage file gives no block", () => {
  const path = join(dirname(t.path), "garbage.db")
  Bun.write(path, "not a database")
  expect(recallBlockFromFile(path, { cap: 1500 })).toBeUndefined()
})

test("reading from a file leaves the database and its directory unchanged", async () => {
  t.store.remember({ nodes: [{ id: "f1", kind: "fact", title: "pinned one", props: { pinned: true } }] }, { agent: "main" })
  t.db.run("pragma wal_checkpoint(truncate)")
  const dir = dirname(t.path)
  const before = { size: statSync(t.path).size, mtime: statSync(t.path).mtimeMs, files: readdirSync(dir).sort() }
  const block = recallBlockFromFile(t.path, { cap: 1500 })
  expect(block).toContain("pinned one")
  const after = { size: statSync(t.path).size, mtime: statSync(t.path).mtimeMs, files: readdirSync(dir).sort() }
  expect(after.size).toBe(before.size)
  expect(after.mtime).toBe(before.mtime)
  expect(after.files).toEqual(before.files)
})

test("the read-only handle rejects writes", () => {
  const db = new Database(t.path, { readonly: true })
  expect(() => db.run("insert into meta(key, value) values('x', 'y')")).toThrow()
  db.close()
})

test("reading works while a writer holds the file open in wal mode", () => {
  t.store.remember({ nodes: [{ id: "f1", kind: "fact", title: "live pinned", props: { pinned: true } }] }, { agent: "main" })
  expect(recallBlockFromFile(t.path, { cap: 1500 })).toContain("live pinned")
})
