import type { Database, SQLQueryBindings } from "bun:sqlite"
import { buildMatch } from "./fts"
import { toEdge, toNode, type EdgeRow, type NodeRow } from "./rows"
import type {
  Actor,
  EdgeInput,
  EdgeRecord,
  ForgetInput,
  ForgetResult,
  NodeInput,
  OpenedNode,
  OpenQuery,
  RecallNode,
  RecallQuery,
  RecallResult,
  RememberInput,
  RememberResult,
} from "./types"

const scopePattern = /^(shared|agent:.+)$/
const defaultExpansionCap = 300
const maxLimit = 50
const maxHops = 2
const dayMs = 86_400_000

export const newId = (kind: string): string => `${kind}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`

const ownScope = (agent: string | undefined): string | null => (agent ? `agent:${agent}` : null)

export const createMemory = (db: Database, expansionCap: number = defaultExpansionCap) => {
  const findNode = db.query<NodeRow, [string]>("select * from node where id = ?1")
  const findByKey = db.query<{ id: string }, [string, string, string]>(
    "select id from node where kind = ?1 and title = ?2 and scope = ?3 and invalidated_at is null order by created_at limit 1",
  )
  const insertNode = db.query(
    `insert into node(id, kind, project, scope, title, body, props, created_by, session_id, created_at, updated_at)
     values(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  )
  const updateNode = db.query(
    `update node set
       title = coalesce(?2, title),
       body = coalesce(?3, body),
       project = coalesce(?4, project),
       scope = coalesce(?5, scope),
       props = case when ?6 is null then props else json_patch(props, ?6) end,
       updated_at = ?7
     where id = ?1`,
  )
  const upsertEdge = db.query(
    `insert into edge(src, dst, type, props, created_at) values(?1, ?2, ?3, ?4, ?5)
     on conflict(src, dst, type) do update set props = excluded.props, invalidated_at = null`,
  )
  const invalidateNode = db.query(
    `update node set invalidated_at = coalesce(invalidated_at, ?2), superseded_by = coalesce(?3, superseded_by), updated_at = ?2
     where id = ?1`,
  )

  const checkScope = (scope: string | undefined) => {
    if (scope !== undefined && !scopePattern.test(scope)) throw new Error(`invalid scope: ${scope}`)
  }

  const putNode = (input: NodeInput, actor: Actor, now: number): { id: string; created: boolean } => {
    checkScope(input.scope)
    const props = input.props === undefined ? null : JSON.stringify(input.props)
    const target = input.scope ?? "shared"
    const mine = (scope: string) => scope === "shared" || scope === ownScope(actor.agent)
    let id = input.id
    if (id === undefined && input.title !== undefined && input.kind !== "task" && mine(target)) {
      id = findByKey.get(input.kind, input.title, target)?.id
    }
    const existing = id === undefined ? null : findNode.get(id)
    if (id !== undefined && existing) {
      if (!mine(existing.scope)) throw new Error(`node is not visible: ${id}`)
      if (existing.kind !== input.kind) throw new Error(`kind mismatch for ${id}: ${existing.kind}`)
      if (input.scope !== undefined && !mine(input.scope)) throw new Error(`invalid scope: ${input.scope}`)
      updateNode.run(id, input.title ?? null, input.body ?? null, input.project ?? null, input.scope ?? null, props, now)
      return { id, created: false }
    }
    const created = id ?? newId(input.kind)
    insertNode.run(
      created,
      input.kind,
      input.project ?? null,
      input.scope ?? "shared",
      input.title ?? null,
      input.body ?? null,
      props ?? "{}",
      actor.agent ?? null,
      actor.session ?? null,
      now,
    )
    return { id: created, created: true }
  }

  const putEdge = (edge: EdgeInput, now: number): string | undefined => {
    for (const end of [edge.src, edge.dst]) {
      if (!findNode.get(end)) throw new Error(`unknown node: ${end}`)
    }
    upsertEdge.run(edge.src, edge.dst, edge.type, JSON.stringify(edge.props ?? {}), now)
    if (edge.type !== "supersedes") return undefined
    invalidateNode.run(edge.dst, now, edge.src)
    return edge.dst
  }

  const remember = (input: RememberInput, actor: Actor): RememberResult => {
    const run = db.transaction((): RememberResult => {
      const now = Date.now()
      const refs = new Map<string, string>()
      const nodes = (input.nodes ?? []).map((node) => {
        const put = putNode(node, actor, now)
        if (node.ref !== undefined) refs.set(node.ref, put.id)
        return { ref: node.ref, id: put.id, created: put.created }
      })
      const invalidated: string[] = []
      for (const edge of input.edges ?? []) {
        const hit = putEdge(
          { ...edge, src: refs.get(edge.src) ?? edge.src, dst: refs.get(edge.dst) ?? edge.dst },
          now,
        )
        if (hit !== undefined) invalidated.push(hit)
      }
      return { nodes, edges: (input.edges ?? []).length, invalidated }
    })
    return run.immediate()
  }

  const link = (edge: EdgeInput): { invalidated?: string } => {
    const run = db.transaction(() => putEdge(edge, Date.now()))
    const hit = run.immediate()
    return hit === undefined ? {} : { invalidated: hit }
  }

  const forget = (input: ForgetInput): ForgetResult => {
    const run = db.transaction((): ForgetResult => {
      const now = Date.now()
      const invalidated: string[] = []
      const missing: string[] = []
      const already: string[] = []
      if (input.superseded_by !== undefined && !findNode.get(input.superseded_by)) {
        throw new Error(`unknown node: ${input.superseded_by}`)
      }
      for (const id of input.ids) {
        const row = findNode.get(id)
        if (!row) missing.push(id)
        else if (row.invalidated_at !== null) already.push(id)
        else {
          invalidateNode.run(id, now, input.superseded_by ?? null)
          invalidated.push(id)
        }
      }
      return { invalidated, missing, already }
    })
    return run.immediate()
  }

  const visible = (alias: string, agent: string | undefined, history: boolean, params: SQLQueryBindings[]): string => {
    params.push(ownScope(agent))
    const scope = `(${alias}.scope = 'shared' or ${alias}.scope = ?${params.length})`
    return history ? scope : `${scope} and ${alias}.invalidated_at is null`
  }

  const recall = (input: RecallQuery): RecallResult => {
    const limit = Math.max(1, Math.min(input.limit ?? 10, maxLimit))
    const hops = Math.max(0, Math.min(input.hops ?? 1, maxHops))
    const history = input.history ?? false
    const now = Date.now()

    const run = (match: string | undefined): { id: string; rank: number }[] => {
      const params: SQLQueryBindings[] = []
      const filters: string[] = []
      let from = "node n"
      let order = "n.updated_at desc"
      let rank = "0"
      if (match !== undefined) {
        params.push(match)
        from = `node_fts join node n on n.rowid = node_fts.rowid`
        filters.push(`node_fts match ?${params.length}`)
        order = "-bm25(node_fts)"
        rank = "-bm25(node_fts)"
      }
      filters.push(visible("n", input.agent, history, params))
      if (input.kinds && input.kinds.length > 0) {
        const marks = input.kinds.map((kind) => {
          params.push(kind)
          return `?${params.length}`
        })
        filters.push(`n.kind in (${marks.join(",")})`)
      }
      if (input.project !== undefined) {
        params.push(input.project)
        filters.push(`n.project = ?${params.length}`)
      }
      params.push(limit)
      const sql = `select n.id as id, ${rank} as rank from ${from} where ${filters.join(" and ")} order by ${order} ${match === undefined ? "" : "desc"} limit ?${params.length}`
      return db.query<{ id: string; rank: number }, SQLQueryBindings[]>(sql).all(...params)
    }

    let seeds: { id: string; rank: number }[]
    if (input.query !== undefined && input.query.trim() !== "") {
      const strict = buildMatch(input.query, "AND")
      seeds = strict === undefined ? [] : run(strict)
      if (seeds.length === 0 && strict !== undefined) {
        const loose = buildMatch(input.query, "OR")
        if (loose !== undefined && loose !== strict) seeds = run(loose)
      }
    } else {
      seeds = run(undefined)
    }
    if (seeds.length === 0) return { nodes: [], edges: [] }

    const maxRank = Math.max(...seeds.map((seed) => seed.rank))
    const seedScore = new Map(seeds.map((seed) => [seed.id, maxRank > 0 ? seed.rank / maxRank : 1]))

    const hop = new Map<string, number>()
    const relevance = new Map<string, number>()
    const note = (id: string, depth: number, seed: string) => {
      hop.set(id, Math.min(hop.get(id) ?? depth, depth))
      relevance.set(id, Math.max(relevance.get(id) ?? 0, (seedScore.get(seed) ?? 0) * 0.5 ** depth))
    }
    if (hops === 0) {
      for (const seed of seeds) note(seed.id, 0, seed.id)
    } else {
      const params: SQLQueryBindings[] = [JSON.stringify(seeds.map((seed) => seed.id)), hops]
      const edgeLive = history ? "" : " and e.invalidated_at is null"
      const out = visible("m", input.agent, history, params)
      const sql = `with recursive walk(id, d, seed) as (
          select value, 0, value from json_each(?1)
          union
          select e.dst, w.d + 1, w.seed from walk w join edge e on e.src = w.id join node m on m.id = e.dst
            where w.d < ?2${edgeLive} and ${out}
          union
          select e.src, w.d + 1, w.seed from walk w join edge e on e.dst = w.id join node m on m.id = e.src
            where w.d < ?2${edgeLive} and ${out}
        )
        select id, d, seed from walk limit ${expansionCap}`
      const rows = db.query<{ id: string; d: number; seed: string }, SQLQueryBindings[]>(sql).all(...params)
      for (const row of rows) note(row.id, row.d, row.seed)
    }

    const ids = [...hop.keys()]
    const records = db
      .query<NodeRow, [string]>("select n.* from node n join json_each(?1) j on n.id = j.value")
      .all(JSON.stringify(ids))
    const nodes: RecallNode[] = records
      .map((row) => {
        const node = toNode(row)
        const recency = 1 / (1 + Math.max(0, now - node.updated_at) / (30 * dayMs))
        const score = 0.8 * (relevance.get(node.id) ?? 0) + 0.2 * recency
        const text = node.body ?? node.title ?? ""
        return { ...node, hop: hop.get(node.id) ?? 0, score, snippet: text.length > 200 ? `${text.slice(0, 200)}...` : text }
      })
      .sort((a, b) => b.score - a.score || a.hop - b.hop)
      .slice(0, limit)

    const keep = JSON.stringify(nodes.map((node) => node.id))
    const edges = db
      .query<EdgeRow, [string]>(
        `select e.* from edge e where e.src in (select value from json_each(?1)) and e.dst in (select value from json_each(?1))${history ? "" : " and e.invalidated_at is null"}`,
      )
      .all(keep)
      .map(toEdge)
    return { nodes, edges }
  }

  const open = (input: OpenQuery): OpenedNode[] => {
    const history = input.history ?? false
    const result: OpenedNode[] = []
    for (const id of input.ids) {
      const row = findNode.get(id)
      if (!row) continue
      const node = toNode(row)
      if (node.scope !== "shared" && node.scope !== ownScope(input.agent)) continue
      if (!history && node.invalidated_at !== null) continue
      const allEdges: EdgeRecord[] = db
        .query<EdgeRow, [string]>(
          `select * from edge where (src = ?1 or dst = ?1)${history ? "" : " and invalidated_at is null"} order by created_at`,
        )
        .all(id)
        .map(toEdge)
      const otherIds = [...new Set(allEdges.map((edge) => (edge.src === id ? edge.dst : edge.src)))]
      const params: SQLQueryBindings[] = [JSON.stringify(otherIds)]
      const scope = visible("n", input.agent, history, params)
      const neighbours = db
        .query<{ id: string; kind: string; title: string | null }, SQLQueryBindings[]>(
          `select n.id, n.kind, n.title from node n join json_each(?1) j on n.id = j.value where ${scope}`,
        )
        .all(...params)
      const seen = new Set(neighbours.map((n) => n.id))
      const edges = allEdges.filter((edge) => seen.has(edge.src === id ? edge.dst : edge.src))
      result.push({ node, edges, neighbours })
    }
    return result
  }

  return { remember, recall, open, link, forget }
}

export type Memory = ReturnType<typeof createMemory>
