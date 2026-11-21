import { afterEach, beforeEach, expect, test } from "bun:test"
import { tempStore } from "./helpers"

let t = tempStore()

beforeEach(() => {
  t = tempStore()
})

afterEach(() => {
  t.close()
})

const actor = { agent: "main", session: "s1" }

const ids = (result: { nodes: readonly { id: string }[] }) => result.nodes.map((n) => n.id).sort()

test("english and russian tokens are found", () => {
  t.store.remember(
    {
      nodes: [
        { id: "a", kind: "fact", title: "Queue worker", body: "The worker reads the queue" },
        { id: "b", kind: "fact", title: "Очередь задач", body: "Воркер читает очередь по расписанию" },
      ],
    },
    actor,
  )
  expect(ids(t.store.recall({ query: "queue" }))).toEqual(["a"])
  expect(ids(t.store.recall({ query: "очередь" }))).toEqual(["b"])
  expect(ids(t.store.recall({ query: "расписание", hops: 0 }))).toEqual(["b"])
})

test("russian prefix rule matches inflected forms", () => {
  t.store.remember({ nodes: [{ id: "b", kind: "fact", title: "Запись", body: "Задачи хранятся в графе" }] }, actor)
  expect(ids(t.store.recall({ query: "задача" }))).toEqual(["b"])
  expect(ids(t.store.recall({ query: "графа" }))).toEqual(["b"])
})

test("yo and ye match both ways", () => {
  t.store.remember(
    {
      nodes: [
        { id: "yo", kind: "fact", title: "Ёлка", body: "зелёный отчёт" },
        { id: "ye", kind: "fact", title: "Елка", body: "зеленый отчет" },
      ],
    },
    actor,
  )
  expect(ids(t.store.recall({ query: "отчёт" }))).toEqual(["ye", "yo"])
  expect(ids(t.store.recall({ query: "отчет" }))).toEqual(["ye", "yo"])
  expect(ids(t.store.recall({ query: "Ёлка" }))).toEqual(["ye", "yo"])
})

test("fts stays in step after an update", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "alpha", body: "first body" }] }, actor)
  t.store.remember({ nodes: [{ id: "a", kind: "fact", body: "second text" }] }, actor)
  expect(ids(t.store.recall({ query: "first" }))).toEqual([])
  expect(ids(t.store.recall({ query: "second" }))).toEqual(["a"])
})

test("upsert by key reuses the node", () => {
  const first = t.store.remember({ nodes: [{ kind: "entity", title: "Router", body: "v1" }] }, actor)
  const second = t.store.remember({ nodes: [{ kind: "entity", title: "Router", body: "v2" }] }, actor)
  expect(second.nodes[0].id).toBe(first.nodes[0].id)
  expect(second.nodes[0].created).toBe(false)
  expect(t.store.open({ ids: [first.nodes[0].id] })[0].node.body).toBe("v2")
})

test("a batch with a failing edge rolls back every node", () => {
  expect(() =>
    t.store.remember(
      { nodes: [{ id: "a", kind: "fact", title: "x" }], edges: [{ src: "a", dst: "missing", type: "relates_to" }] },
      actor,
    ),
  ).toThrow()
  expect(t.store.open({ ids: ["a"] })).toEqual([])
})

test("refs link new nodes inside one batch", () => {
  const result = t.store.remember(
    {
      nodes: [
        { ref: "x", kind: "entity", title: "Alpha" },
        { ref: "y", kind: "fact", title: "Beta fact", body: "about alpha" },
      ],
      edges: [{ src: "y", dst: "x", type: "about" }],
    },
    actor,
  )
  const y = result.nodes[1].id
  const opened = t.store.open({ ids: [y] })[0]
  expect(opened.edges).toHaveLength(1)
  expect(opened.neighbours[0].id).toBe(result.nodes[0].id)
})

test("hops expand along edges and hop 0 does not", () => {
  t.store.remember(
    {
      nodes: [
        { id: "p", kind: "project", title: "Project alpha" },
        { id: "f", kind: "fact", title: "Cache", body: "uses redis" },
        { id: "g", kind: "fact", title: "Other", body: "unrelated" },
      ],
      edges: [
        { src: "f", dst: "p", type: "about" },
        { src: "g", dst: "p", type: "about" },
      ],
    },
    actor,
  )
  expect(ids(t.store.recall({ query: "redis", hops: 0 }))).toEqual(["f"])
  expect(ids(t.store.recall({ query: "redis", hops: 1 }))).toEqual(["f", "p"])
  const two = t.store.recall({ query: "redis", hops: 2 })
  expect(ids(two)).toEqual(["f", "g", "p"])
  expect(two.nodes.find((n) => n.id === "g")?.hop).toBe(2)
  expect(two.nodes[0].id).toBe("f")
  expect(two.edges).toHaveLength(2)
})

test("kinds, project and limit filter the seeds", () => {
  t.store.remember(
    {
      nodes: [
        { id: "a", kind: "fact", project: "p1", title: "shared word" },
        { id: "b", kind: "decision", project: "p2", title: "shared word" },
        { id: "c", kind: "fact", project: "p2", title: "shared word" },
      ],
    },
    actor,
  )
  expect(ids(t.store.recall({ query: "shared", kinds: ["decision"], hops: 0 }))).toEqual(["b"])
  expect(ids(t.store.recall({ query: "shared", project: "p2", hops: 0 }))).toEqual(["b", "c"])
  expect(t.store.recall({ query: "shared", hops: 0, limit: 2 }).nodes).toHaveLength(2)
})

test("scope shows shared plus the caller's own agent scope", () => {
  t.store.remember(
    {
      nodes: [
        { id: "s", kind: "fact", title: "note shared" },
        { id: "w1", kind: "fact", title: "note mine", scope: "agent:w1" },
        { id: "w2", kind: "fact", title: "note theirs", scope: "agent:w2" },
      ],
    },
    actor,
  )
  expect(ids(t.store.recall({ query: "note", agent: "w1", hops: 0 }))).toEqual(["s", "w1"])
  expect(ids(t.store.recall({ query: "note", hops: 0 }))).toEqual(["s"])
  expect(t.store.open({ ids: ["w2"], agent: "w1" })).toEqual([])
  expect(() => t.store.remember({ nodes: [{ kind: "fact", title: "x", scope: "bad" }] }, actor)).toThrow()
})

test("a forgotten node is absent from default recall and present with history", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "temporary fact" }] }, actor)
  const result = t.store.forget({ ids: ["a", "nope"] })
  expect(result.invalidated).toEqual(["a"])
  expect(result.missing).toEqual(["nope"])
  expect(t.store.forget({ ids: ["a"] }).already).toEqual(["a"])
  expect(ids(t.store.recall({ query: "temporary" }))).toEqual([])
  expect(ids(t.store.recall({ query: "temporary", history: true }))).toEqual(["a"])
  expect(t.store.open({ ids: ["a"] })).toEqual([])
  expect(t.store.open({ ids: ["a"], history: true })[0].node.invalidated_at).not.toBeNull()
  expect(t.db.query<{ c: number }, []>("select count(*) c from node").get()?.c).toBe(1)
})

test("worked example: a decision is replaced", () => {
  t.store.remember(
    {
      nodes: [
        { id: "p-alpha", kind: "project", title: "alpha" },
        { id: "d1", kind: "decision", project: "alpha", title: "Use queue A", body: "lower latency" },
      ],
      edges: [{ src: "d1", dst: "p-alpha", type: "about" }],
    },
    actor,
  )
  const second = t.store.remember(
    {
      nodes: [{ id: "d2", kind: "decision", project: "alpha", title: "Use queue B", body: "queue A was dropped" }],
      edges: [{ src: "d2", dst: "d1", type: "supersedes" }],
    },
    actor,
  )
  expect(second.invalidated).toEqual(["d1"])
  const d1 = t.store.open({ ids: ["d1"], history: true })[0].node
  expect(d1.invalidated_at).not.toBeNull()
  expect(d1.superseded_by).toBe("d2")
  const current = t.store.recall({ query: "queue", kinds: ["decision"], hops: 0 })
  expect(ids(current)).toEqual(["d2"])
  const history = t.store.recall({ query: "queue", kinds: ["decision"], hops: 0, history: true })
  expect(ids(history)).toEqual(["d1", "d2"])
  expect(history.edges.map((e) => e.type)).toEqual(["supersedes"])
})

test("link adds an edge and supersedes invalidates the target", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "old" }, { id: "b", kind: "fact", title: "new" }] }, actor)
  expect(t.store.link({ src: "b", dst: "a", type: "supersedes" })).toEqual({ invalidated: "a" })
  expect(t.store.open({ ids: ["a"], history: true })[0].node.superseded_by).toBe("b")
  expect(() => t.store.link({ src: "b", dst: "zzz", type: "relates_to" })).toThrow()
})

test("forget with superseded_by records the replacement", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "old" }, { id: "b", kind: "fact", title: "new" }] }, actor)
  t.store.forget({ ids: ["a"], superseded_by: "b" })
  expect(t.store.open({ ids: ["a"], history: true })[0].node.superseded_by).toBe("b")
  expect(() => t.store.forget({ ids: ["b"], superseded_by: "missing" })).toThrow()
})

test("recall without a query returns recent nodes", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "one" }, { id: "b", kind: "fact", title: "two" }] }, actor)
  expect(ids(t.store.recall({ hops: 0 }))).toEqual(["a", "b"])
})

test("key upsert never touches another agent's private node", () => {
  const first = t.store.remember({ nodes: [{ kind: "fact", title: "secret", body: "mine", scope: "agent:w1" }] }, { agent: "w1" })
  const second = t.store.remember({ nodes: [{ kind: "fact", title: "secret", body: "theirs", scope: "agent:w2" }] }, { agent: "w2" })
  const shared = t.store.remember({ nodes: [{ kind: "fact", title: "secret", body: "open" }] }, { agent: "w2" })
  const intrude = t.store.remember({ nodes: [{ kind: "fact", title: "secret", body: "forged", scope: "agent:w1" }] }, { agent: "w2" })
  expect(second.nodes[0].id).not.toBe(first.nodes[0].id)
  expect(shared.nodes[0].id).not.toBe(first.nodes[0].id)
  expect(intrude.nodes[0].id).not.toBe(first.nodes[0].id)
  expect(t.store.open({ ids: [first.nodes[0].id], agent: "w1" })[0].node.body).toBe("mine")
})

test("an explicit id of a node the caller cannot see is rejected", () => {
  t.store.remember({ nodes: [{ id: "p", kind: "fact", title: "secret", body: "mine", scope: "agent:w1" }] }, { agent: "w1" })
  expect(() => t.store.remember({ nodes: [{ id: "p", kind: "fact", body: "forged" }] }, { agent: "w2" })).toThrow()
  expect(t.store.open({ ids: ["p"], agent: "w1" })[0].node.body).toBe("mine")
})

test("an existing id with another kind is rejected", () => {
  t.store.remember({ nodes: [{ id: "a", kind: "fact", title: "x" }] }, actor)
  expect(() => t.store.remember({ nodes: [{ id: "a", kind: "decision", title: "x" }] }, actor)).toThrow()
})

test("props merge and remembering over a task keeps its status", () => {
  t.store.task.create({ id: "t1", title: "Build" }, actor)
  t.store.remember({ nodes: [{ id: "t1", kind: "task", props: { label: "urgent" } }] }, actor)
  const node = t.store.open({ ids: ["t1"] })[0].node
  expect(node.props).toEqual({ status: "open", label: "urgent" })
})

test("open hides edges to nodes the caller cannot see", () => {
  t.store.remember(
    {
      nodes: [
        { id: "s", kind: "fact", title: "shared one" },
        { id: "q", kind: "fact", title: "private one", scope: "agent:w2" },
      ],
      edges: [{ src: "s", dst: "q", type: "relates_to" }],
    },
    { agent: "w2" },
  )
  const other = t.store.open({ ids: ["s"], agent: "w1" })[0]
  expect(other.edges).toEqual([])
  expect(other.neighbours).toEqual([])
  expect(t.store.open({ ids: ["s"], agent: "w2" })[0].edges).toHaveLength(1)
})

test("a russian token of seven letters or more matches an inflected form", () => {
  t.store.remember({ nodes: [{ id: "q", kind: "fact", title: "Порядок", body: "обработка очереди сообщений" }] }, actor)
  expect(ids(t.store.recall({ query: "очередь", hops: 0 }))).toEqual(["q"])
})
