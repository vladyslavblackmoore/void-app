export type OverviewState = "waiting" | "running" | "idle"
export type OverviewFilter = "all" | "running" | "waiting"

export type OverviewSession = {
  id: string
  working: boolean
  waiting: boolean
}

export function overviewState(item: OverviewSession): OverviewState {
  if (item.waiting) return "waiting"
  return item.working ? "running" : "idle"
}

export function overviewStats(items: OverviewSession[]) {
  return {
    sessions: items.length,
    running: items.filter((item) => overviewState(item) === "running").length,
    needsYou: items.filter((item) => item.waiting).length,
  }
}

export function filterOverview<T extends OverviewSession>(items: T[], filter: OverviewFilter) {
  if (filter === "all") return items
  return items.filter((item) => overviewState(item) === filter)
}
