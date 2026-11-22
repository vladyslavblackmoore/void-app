export const AGENT_TREE_MAX_DEPTH = 2

const marker = /^\s*(?:\[delegated worker\]\s*)+/

export function stripDelegationMarker(title: string | undefined) {
  if (title === undefined) return title
  return title.replace(marker, "").trim()
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

export type AgentRunState = "running" | "idle" | "error"

export function agentRunState(status: { type: string } | undefined, failed: boolean): AgentRunState {
  if (status?.type === "busy" || status?.type === "retry") return "running"
  return failed ? "error" : "idle"
}

export function withoutRemoved<T extends { id: string }>(sessions: T[], removed: ReadonlySet<string>) {
  if (removed.size === 0) return sessions
  return sessions.filter((item) => !removed.has(item.id))
}
