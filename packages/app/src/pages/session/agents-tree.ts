import { isDelegateTool, shortLabel, unconfirmedSessionId } from "@opencode-ai/session-ui/delegate-label"

export const AGENT_TREE_MAX_DEPTH = 2

const marker = /^\s*(?:\[delegated worker\]\s*)+/

export function stripDelegationMarker(title: string | undefined) {
  if (title === undefined) return title
  return title.replace(marker, "").trim()
}

const workerNote = /^\s*\[delegated worker\][\s\S]*?\n\s*\n/

export { shortLabel }

const leadingNoise = /^(?:\s+|delegate:|\[delegated worker\])+/

export function cleanAgentTitle(title: string) {
  return title.replace(leadingNoise, "").trim()
}

export function agentRowTitle(title: string | undefined) {
  if (title === undefined) return ""
  return shortLabel(cleanAgentTitle(title))
}

export function agentFullTitle(title: string | undefined) {
  if (title === undefined) return ""
  return cleanAgentTitle(title).replace(/\s+/g, " ")
}

export type AgentTurn = { id: string; created: number; label: string }

export type AgentGroup<T extends TreeSession> = { turnID: string; label: string; rows: AgentRow<T>[] }

export function groupAgentRowsByTurn<T extends TreeSession>(rows: AgentRow<T>[], turns: AgentTurn[]) {
  const ordered = turns.slice().sort((a, b) => a.created - b.created)
  const groups: AgentGroup<T>[] = []
  const index = new Map<string, AgentGroup<T>>()
  let current: AgentGroup<T> | undefined
  for (const row of rows) {
    if (row.depth > 1 && current) {
      current.rows.push(row)
      continue
    }
    const turn = ordered.findLast((item) => item.created <= row.session.time.created) ?? ordered[0]
    const key = turn?.id ?? ""
    let group = index.get(key)
    if (!group) {
      group = { turnID: key, label: turn?.label ?? "", rows: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.rows.push(row)
    current = group
  }
  return groups.sort((a, b) => {
    const left = ordered.findIndex((item) => item.id === a.turnID)
    const right = ordered.findIndex((item) => item.id === b.turnID)
    return left - right
  })
}

export function stripWorkerNote(text: string) {
  if (!marker.test(text)) return text
  const stripped = text.replace(workerNote, "")
  return stripped === text ? stripDelegationMarker(text)! : stripped.trim()
}

export function withoutWorkerNote<T extends { type: string }>(parts: T[]): T[] {
  const text = (part: T) => (part as T & { text?: string }).text ?? ""
  if (!parts.some((part) => part.type === "text" && marker.test(text(part)))) return parts
  return parts.map((part) => (part.type === "text" ? { ...part, text: stripWorkerNote(text(part)) } : part))
}

type TreeSession = {
  id: string
  parentID?: string
  time: { created: number; archived?: number }
}

export type AgentRow<T extends TreeSession> = { session: T; depth: number }

export function buildAgentTree<T extends TreeSession>(sessions: T[], rootID: string, maxDepth = AGENT_TREE_MAX_DEPTH) {
  const byParent = new Map<string, T[]>()
  for (const item of sessions) {
    if (!item.parentID || item.time.archived) continue
    const list = byParent.get(item.parentID)
    if (list) list.push(item)
    else byParent.set(item.parentID, [item])
  }
  const rows: AgentRow<T>[] = []
  const seen = new Set<string>([rootID])
  const walk = (parentID: string, depth: number) => {
    if (depth > maxDepth) return
    const children = (byParent.get(parentID) ?? []).slice().sort((a, b) => a.time.created - b.time.created)
    for (const child of children) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      rows.push({ session: child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(rootID, 1)
  return rows
}

export type AgentRunState = "running" | "idle" | "error" | "aborted" | "unconfirmed"

export function unconfirmedSessionIds(parts: readonly unknown[]) {
  const ids = new Set<string>()
  for (const item of parts) {
    const part = item as { type?: string; tool?: string; state?: { output?: unknown } }
    if (part?.type !== "tool" || !part.tool || !isDelegateTool(part.tool)) continue
    const output = part.state?.output
    const id = unconfirmedSessionId(typeof output === "string" ? output : undefined)
    if (id) ids.add(id)
  }
  return ids
}

export function agentRunState(
  status: { type: string } | undefined,
  failed: boolean,
  aborted = false,
  unconfirmed = false,
): AgentRunState {
  if (status?.type === "busy" || status?.type === "retry") return "running"
  if (aborted) return "aborted"
  if (failed) return "error"
  return unconfirmed ? "unconfirmed" : "idle"
}

export function withoutRemoved<T extends { id: string }>(sessions: T[], removed: ReadonlySet<string>) {
  if (removed.size === 0) return sessions
  return sessions.filter((item) => !removed.has(item.id))
}

export function shouldAutoOpenAgents(
  sessions: readonly { parentID?: string; time: { created: number; archived?: number } }[],
  rootID: string,
  since: number,
) {
  return sessions.some((item) => item.parentID === rootID && !item.time.archived && item.time.created >= since)
}
