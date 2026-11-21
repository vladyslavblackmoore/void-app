import { afterEach, beforeEach, expect, test } from "bun:test"
import { openDatabase } from "../src/db"
import { createStore } from "../src/store"
import { tempStore } from "./helpers"

let t = tempStore()

beforeEach(() => {
  t = tempStore()
})

afterEach(() => {
  t.close()
})

const main = { agent: "main" }

test("task_create stores an open task, dependency edges and event rows", () => {
  const first = t.store.task.create({ id: "t1", title: "Build", brief: "build it", project: "alpha" }, main)
  const second = t.store.task.create({ id: "t2", title: "Ship", deps: ["t1"] }, main)
  expect(first.status).toBe("open")
  expect(second.deps).toEqual(["t1"])
  expect(t.store.open({ ids: ["t2"] })[0].edges.map((e) => `${e.src} ${e.type} ${e.dst}`)).toEqual(["t2 depends_on t1"])
  const events = t.store.task.changes(0).events
  expect(events.map((e) => [e.task_id, e.from_status, e.to_status])).toEqual([
    ["t1", null, "open"],
    ["t2", null, "open"],
  ])
  expect(() => t.store.task.create({ title: "x", deps: ["missing"] }, main)).toThrow()
})

test("two claims of one task give one winner and the loser is told", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  const a = t.store.task.claim("t1", { agent: "w1" })
  const b = t.store.task.claim("t1", { agent: "w2" })
  expect([a.claimed, b.claimed]).toEqual([true, false])
  expect(b).toEqual({ claimed: false, reason: "not_open", status: "claimed", claimed_by: "w1" })
  expect(t.store.task.claim("nope", main)).toEqual({ claimed: false, reason: "not_found" })
  expect(t.store.task.changes(0).events.filter((e) => e.to_status === "claimed")).toHaveLength(1)
})

test("a sequential double claim from two connections gives exactly one winner", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  const other = createStore(openDatabase(t.path).db)
  const results = [t.store.task.claim("t1", { agent: "w1" }), other.task.claim("t1", { agent: "w2" })]
  expect(results.filter((r) => r.claimed)).toHaveLength(1)
})

test("ready excludes tasks with an unfinished dependency", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  t.store.task.create({ id: "t2", title: "Ship", deps: ["t1"] }, main)
  expect(t.store.task.list({ ready: true }).map((x) => x.id)).toEqual(["t1"])
  expect(t.store.task.list({}).map((x) => x.id)).toEqual(["t1", "t2"])
  t.store.task.claim("t1", { agent: "w1" })
  expect(t.store.task.list({ ready: true })).toEqual([])
  t.store.task.result({ id: "t1", result: "built" }, { agent: "w1" })
  expect(t.store.task.list({ ready: true }).map((x) => x.id)).toEqual(["t2"])
})

test("task_update changes status with a note and rejects finished tasks", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  t.store.task.claim("t1", { agent: "w1" })
  const updated = t.store.task.update({ id: "t1", status: "in_progress", note: "halfway" }, { agent: "w1" })
  expect(updated.status).toBe("in_progress")
  expect(updated.claimed_by).toBe("w1")
  t.store.task.update({ id: "t1", status: "cancelled" }, main)
  expect(() => t.store.task.update({ id: "t1", status: "open" }, main)).toThrow()
  expect(t.store.task.list({ status: "cancelled" }).map((x) => x.id)).toEqual(["t1"])
  expect(t.store.task.list({ claimed_by: "w1" }).map((x) => x.id)).toEqual(["t1"])
})

test("board_changes returns events after a cursor in order", () => {
  t.store.task.create({ id: "t1", title: "A", project: "p1" }, main)
  t.store.task.create({ id: "t2", title: "B", project: "p2" }, main)
  const first = t.store.task.changes(0)
  expect(first.events).toHaveLength(2)
  t.store.task.claim("t1", { agent: "w1" })
  t.store.task.update({ id: "t1", status: "in_progress", note: "go" }, { agent: "w1" })
  t.store.task.result({ id: "t1", result: "ok" }, { agent: "w1" })
  const next = t.store.task.changes(first.cursor)
  expect(next.events.map((e) => [e.to_status, e.actor])).toEqual([
    ["claimed", "w1"],
    ["in_progress", "w1"],
    ["done", "w1"],
  ])
  expect(next.events.map((e) => e.seq)).toEqual(next.events.map((e) => e.seq).sort((a, b) => a - b))
  expect(next.cursor).toBe(next.events[2].seq)
  expect(t.store.task.changes(next.cursor)).toEqual({ events: [], cursor: next.cursor })
  expect(t.store.task.changes(0, 100, "p2").events.map((e) => e.task_id)).toEqual(["t2"])
  expect(t.store.task.changes(0, 2).events).toHaveLength(2)
})

test("worked example: a task with a dependency and a result", () => {
  t.store.task.create({ id: "t1", title: "Collect data", project: "alpha" }, main)
  t.store.task.create({ id: "t2", title: "Write report", project: "alpha", deps: ["t1"] }, main)
  expect(t.store.task.list({ ready: true }).map((x) => x.id)).toEqual(["t1"])
  expect(t.store.task.claim("t1", { agent: "w1" }).claimed).toBe(true)
  expect(t.store.task.claim("t1", { agent: "w2" }).claimed).toBe(false)
  const done = t.store.task.result({ id: "t1", result: "found 12 rows" }, { agent: "w1" })
  expect(done.task.status).toBe("done")
  const result = t.store.open({ ids: [done.result_id] })[0]
  expect(result.node.kind).toBe("result")
  expect(result.node.body).toBe("found 12 rows")
  expect(result.edges.map((e) => `${e.src} ${e.type} ${e.dst}`)).toEqual([`${done.result_id} produced t1`])
  expect(t.store.task.list({ ready: true }).map((x) => x.id)).toEqual(["t2"])
  expect(t.store.recall({ query: "rows", hops: 1 }).nodes.map((n) => n.id)).toContain(done.result_id)
  expect(() => t.store.task.result({ id: "t1", result: "again" }, main)).toThrow()
})

test("depends_on edges need task endpoints on both sides", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  t.store.remember({ nodes: [{ id: "f", kind: "fact", title: "a fact" }] }, main)
  expect(() => t.store.link({ src: "t1", dst: "f", type: "depends_on" })).toThrow()
  expect(() => t.store.link({ src: "f", dst: "t1", type: "depends_on" })).toThrow()
  expect(() => t.store.remember({ edges: [{ src: "t1", dst: "f", type: "depends_on" }] }, main)).toThrow()
  expect(t.store.task.list({ ready: true }).map((x) => x.id)).toEqual(["t1"])
})

test("a depends_on edge that closes a cycle is rejected", () => {
  t.store.task.create({ id: "t1", title: "A" }, main)
  t.store.task.create({ id: "t2", title: "B", deps: ["t1"] }, main)
  t.store.task.create({ id: "t3", title: "C", deps: ["t2"] }, main)
  expect(() => t.store.link({ src: "t1", dst: "t3", type: "depends_on" })).toThrow()
  expect(() => t.store.link({ src: "t1", dst: "t1", type: "depends_on" })).toThrow()
  expect(() => t.store.remember({ edges: [{ src: "t1", dst: "t2", type: "depends_on" }] }, main)).toThrow()
  t.store.link({ src: "t3", dst: "t1", type: "depends_on" })
})

test("a dependency is satisfied by done, cancelled or invalidated but not failed", () => {
  for (const id of ["a", "b", "c", "d"]) t.store.task.create({ id, title: id }, main)
  t.store.task.create({ id: "x", title: "x", deps: ["a", "b", "c", "d"] }, main)
  const ready = () => t.store.task.list({ ready: true }).map((r) => r.id)
  t.store.task.update({ id: "a", status: "failed" }, main)
  t.store.task.update({ id: "b", status: "cancelled" }, main)
  t.store.task.result({ id: "c", result: "ok" }, main)
  expect(ready()).not.toContain("x")
  t.store.forget({ ids: ["d"] })
  expect(ready()).not.toContain("x")
  t.store.task.update({ id: "a", status: "cancelled" }, main)
  expect(ready()).toContain("x")
})

test("a failed dependency keeps the dependent not ready", () => {
  t.store.task.create({ id: "a", title: "a" }, main)
  t.store.task.create({ id: "x", title: "x", deps: ["a"] }, main)
  t.store.task.result({ id: "a", result: "broke", outcome: "failed" }, main)
  expect(t.store.task.list({ ready: true })).toEqual([])
})

test("moving a task back to open clears the claimant and claimed cannot be set by update", () => {
  t.store.task.create({ id: "t1", title: "Build" }, main)
  expect(() => t.store.task.update({ id: "t1", status: "claimed" }, main)).toThrow()
  t.store.task.claim("t1", { agent: "w1" })
  expect(() => t.store.task.update({ id: "t1", status: "claimed" }, { agent: "w2" })).toThrow()
  const reopened = t.store.task.update({ id: "t1", status: "open", note: "released" }, { agent: "w1" })
  expect(reopened.status).toBe("open")
  expect(reopened.claimed_by).toBeNull()
  expect(t.store.task.claim("t1", { agent: "w2" }).claimed).toBe(true)
})
