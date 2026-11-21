import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import type { NodeRow } from "./rows"

export interface RecallBlockOptions {
  readonly agent?: string
  readonly cap: number
}

const open = "<memory>"
const close = "</memory>"
const ellipsis = "…"
const pinnedLimit = 40
const taskLimit = 40
const snippetLength = 160

const flat = (value: string | null): string => (value ?? "").replace(/\s+/g, " ").trim()

const clip = (text: string, length: number): string => {
  if (text.length <= length) return text
  const cut = text.slice(0, Math.max(0, length - ellipsis.length))
  const safe = /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut
  return safe + ellipsis
}

const pinnedLine = (row: NodeRow): string => {
  const title = flat(row.title) || row.id
  const body = clip(flat(row.body), snippetLength)
  return body === "" ? `- [${row.kind}] ${title}` : `- [${row.kind}] ${title}: ${body}`
}

const taskLine = (row: NodeRow & { status: string | null; claimed_by: string | null }): string => {
  const title = flat(row.title) || row.id
  const status = row.status ?? "open"
  const owner = row.claimed_by ? ` @${row.claimed_by}` : ""
  const brief = clip(flat(row.body), snippetLength)
  return `- ${row.id} [${status}${owner}] ${title}${brief === "" ? "" : `: ${brief}`}`
}

const section = (title: string, lines: string[]): string[] => (lines.length === 0 ? [] : [title, ...lines])

export const recallBlock = (db: Database, options: RecallBlockOptions): string | undefined => {
  const agent = options.agent
  const scope = agent ? `agent:${agent}` : null
  const pinned = db
    .query<NodeRow, [string | null, number]>(
      `select * from node
       where invalidated_at is null and json_extract(props, '$.pinned') = 1 and kind != 'task'
         and (scope = 'shared' or scope = ?1)
       order by updated_at desc, rowid desc limit ?2`,
    )
    .all(scope, pinnedLimit)
  const tasks = db
    .query<NodeRow & { status: string | null; claimed_by: string | null }, [string | null, number]>(
      `select n.*, json_extract(n.props, '$.status') as status, json_extract(n.props, '$.claimed_by') as claimed_by
       from node n
       where n.kind = 'task' and n.invalidated_at is null
         and coalesce(json_extract(n.props, '$.status'), 'open') in ('open', 'claimed', 'in_progress', 'blocked')
         and (?1 is null or coalesce(json_extract(n.props, '$.status'), 'open') = 'open' or json_extract(n.props, '$.claimed_by') = ?1)
       order by n.created_at, n.rowid limit ?2`,
    )
    .all(agent ?? null, taskLimit)
  const lines = [...section("Pinned:", pinned.map(pinnedLine)), ...section("Open tasks:", tasks.map(taskLine))]
  if (lines.length === 0) return undefined
  const room = options.cap - open.length - close.length - 2
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + 1
    if (used + cost <= room) {
      kept.push(line)
      used += cost
      continue
    }
    const left = room - used - 1
    if (left >= 12) kept.push(clip(line, left))
    break
  }
  if (kept.length === 0) return undefined
  return [open, ...kept, close].join("\n")
}

export const recallBlockFromFile = (path: string, options: RecallBlockOptions): string | undefined => {
  if (!existsSync(path)) return undefined
  let db: Database | undefined
  try {
    db = new Database(path, { readonly: true })
    db.run("pragma busy_timeout = 2000")
    return recallBlock(db, options)
  } catch {
    return undefined
  } finally {
    db?.close()
  }
}
