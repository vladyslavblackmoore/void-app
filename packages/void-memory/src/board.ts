import type { Database, SQLQueryBindings } from "./sqlite"
import { newId } from "./memory"
import { toNode, type NodeRow } from "./rows"
import {
  type Actor,
  type BoardChanges,
  type ClaimResult,
  type TaskCreateInput,
  type TaskEvent,
  type TaskListQuery,
  type TaskRecord,
  type TaskResultInput,
  type TaskUpdateInput,
} from "./types"

const finished = new Set(["done", "cancelled"])
const maxLimit = 200

const text = (value: unknown): string | null => (typeof value === "string" ? value : null)

export const createBoard = (db: Database) => {
  const findNode = db.query<NodeRow, [string]>("select * from node where id = ?1")
  const depsOf = db.query<{ dst: string }, [string]>(
    "select dst from edge where src = ?1 and type = 'depends_on' and invalidated_at is null order by created_at, dst",
  )
  const insertEvent = db.query(
    "insert into task_event(task_id, actor, from_status, to_status, note, at) values(?1, ?2, ?3, ?4, ?5, ?6)",
  )
  const setStatus = db.query(
    "update node set props = json_set(props, '$.status', ?2), updated_at = ?3 where id = ?1",
  )
  const reopen = db.query(
    "update node set props = json_remove(json_set(props, '$.status', 'open'), '$.claimed_by'), updated_at = ?2 where id = ?1",
  )
  const claimStatement = db.query(
    `update node set props = json_set(props, '$.status', 'claimed', '$.claimed_by', ?2), updated_at = ?3
     where id = ?1 and kind = 'task' and json_extract(props, '$.status') = 'open'`,
  )

  const toTask = (row: NodeRow): TaskRecord => {
    const node = toNode(row)
    return {
      id: node.id,
      title: node.title,
      brief: node.body,
      project: node.project,
      status: text(node.props.status) ?? "open",
      claimed_by: text(node.props.claimed_by),
      created_by: node.created_by,
      created_at: node.created_at,
      updated_at: node.updated_at,
      deps: depsOf.all(node.id).map((dep) => dep.dst),
    }
  }

  const taskRow = (id: string): NodeRow | null => {
    const row = findNode.get(id)
    return row && row.kind === "task" ? row : null
  }

  const statusOf = (row: NodeRow): string => text(toNode(row).props.status) ?? "open"

  const create = (input: TaskCreateInput, actor: Actor): TaskRecord => {
    const run = db.transaction((): TaskRecord => {
      const now = Date.now()
      const id = input.id ?? newId("task")
      if (findNode.get(id)) throw new Error(`node already exists: ${id}`)
      for (const dep of input.deps ?? []) {
        if (!taskRow(dep)) throw new Error(`unknown task: ${dep}`)
      }
      db.query(
        `insert into node(id, kind, project, scope, title, body, props, created_by, session_id, created_at, updated_at)
         values(?1, 'task', ?2, 'shared', ?3, ?4, '{"status":"open"}', ?5, ?6, ?7, ?7)`,
      ).run(id, input.project ?? null, input.title, input.brief ?? null, actor.agent ?? null, actor.session ?? null, now)
      for (const dep of new Set(input.deps ?? [])) {
        db.query("insert into edge(src, dst, type, props, created_at) values(?1, ?2, 'depends_on', '{}', ?3)").run(id, dep, now)
      }
      insertEvent.run(id, actor.agent ?? null, null, "open", "created", now)
      const row = taskRow(id)
      if (!row) throw new Error("task was not stored")
      return toTask(row)
    })
    return run.immediate()
  }

  const claim = (id: string, actor: Actor): ClaimResult => {
    const run = db.transaction((): ClaimResult => {
      const now = Date.now()
      const changes = claimStatement.run(id, actor.agent ?? null, now).changes
      const row = taskRow(id)
      if (!row) return { claimed: false, reason: "not_found" }
      if (changes !== 1) {
        return { claimed: false, reason: "not_open", status: statusOf(row), claimed_by: text(toNode(row).props.claimed_by) }
      }
      insertEvent.run(id, actor.agent ?? null, "open", "claimed", null, now)
      return { claimed: true, task: toTask(row) }
    })
    return run.immediate()
  }

  const update = (input: TaskUpdateInput, actor: Actor): TaskRecord => {
    const run = db.transaction((): TaskRecord => {
      const now = Date.now()
      const row = taskRow(input.id)
      if (!row) throw new Error(`unknown task: ${input.id}`)
      const from = statusOf(row)
      if (finished.has(from)) throw new Error(`task is ${from}`)
      const to = input.status ?? from
      if (input.status === "claimed") throw new Error("use task_claim to claim a task")
      if (to === "open" && from !== "open") reopen.run(input.id, now)
      else if (to !== from) setStatus.run(input.id, to, now)
      insertEvent.run(input.id, actor.agent ?? null, from, to, input.note ?? null, now)
      const next = taskRow(input.id)
      if (!next) throw new Error("task was not stored")
      return toTask(next)
    })
    return run.immediate()
  }

  const result = (input: TaskResultInput, actor: Actor): { result_id: string; task: TaskRecord } => {
    const run = db.transaction(() => {
      const now = Date.now()
      const row = taskRow(input.id)
      if (!row) throw new Error(`unknown task: ${input.id}`)
      const from = statusOf(row)
      if (finished.has(from)) throw new Error(`task is ${from}`)
      const to = input.outcome ?? "done"
      const resultId = newId("result")
      db.query(
        `insert into node(id, kind, project, scope, title, body, props, created_by, session_id, created_at, updated_at)
         values(?1, 'result', ?2, 'shared', ?3, ?4, '{}', ?5, ?6, ?7, ?7)`,
      ).run(
        resultId,
        row.project,
        input.title ?? `Result: ${row.title ?? row.id}`,
        input.result,
        actor.agent ?? null,
        actor.session ?? null,
        now,
      )
      db.query("insert into edge(src, dst, type, props, created_at) values(?1, ?2, 'produced', '{}', ?3)").run(
        resultId,
        input.id,
        now,
      )
      setStatus.run(input.id, to, now)
      insertEvent.run(input.id, actor.agent ?? null, from, to, `result ${resultId}`, now)
      const next = taskRow(input.id)
      if (!next) throw new Error("task was not stored")
      return { result_id: resultId, task: toTask(next) }
    })
    return run.immediate()
  }

  const list = (query: TaskListQuery): TaskRecord[] => {
    const params: SQLQueryBindings[] = []
    const filters = ["n.kind = 'task'", "n.invalidated_at is null"]
    const bind = (value: SQLQueryBindings) => {
      params.push(value)
      return `?${params.length}`
    }
    if (query.ready === true) {
      filters.push("json_extract(n.props, '$.status') = 'open'")
      filters.push(
        `not exists (select 1 from edge e join node d on d.id = e.dst
           where e.src = n.id and e.type = 'depends_on' and e.invalidated_at is null and d.invalidated_at is null and coalesce(json_extract(d.props, '$.status'), 'open') not in ('done', 'cancelled'))`,
      )
    } else if (query.status !== undefined) {
      filters.push(`json_extract(n.props, '$.status') = ${bind(query.status)}`)
    }
    if (query.project !== undefined) filters.push(`n.project = ${bind(query.project)}`)
    if (query.claimed_by !== undefined) filters.push(`json_extract(n.props, '$.claimed_by') = ${bind(query.claimed_by)}`)
    const limit = Math.max(1, Math.min(query.limit ?? 50, maxLimit))
    const sql = `select n.* from node n where ${filters.join(" and ")} order by n.created_at, n.rowid limit ${bind(limit)}`
    return db
      .query<NodeRow, SQLQueryBindings[]>(sql)
      .all(...params)
      .map(toTask)
  }

  const changes = (after: number, limit?: number, project?: string): BoardChanges => {
    const max = Math.max(1, Math.min(limit ?? 100, maxLimit))
    const events =
      project === undefined
        ? db
            .query<TaskEvent, [number, number]>("select * from task_event where seq > ?1 order by seq limit ?2")
            .all(after, max)
        : db
            .query<TaskEvent, [number, string, number]>(
              `select e.* from task_event e join node n on n.id = e.task_id
               where e.seq > ?1 and n.project = ?2 order by e.seq limit ?3`,
            )
            .all(after, project, max)
    return { events, cursor: events.length > 0 ? events[events.length - 1].seq : after }
  }

  return { create, claim, update, result, list, changes }
}

export type Board = ReturnType<typeof createBoard>
