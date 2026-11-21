import { DateTime } from "luxon"

export type SessionListItem = {
  id: string
  title: string
  updated: number
}

export type SessionListGroup<T extends SessionListItem> = {
  id: "today" | "earlier"
  items: T[]
}

export function groupSessionList<T extends SessionListItem>(items: T[], now: number): SessionListGroup<T>[] {
  const startOfToday = DateTime.fromMillis(now).startOf("day").toMillis()
  const today = items.filter((item) => item.updated >= startOfToday)
  const earlier = items.filter((item) => item.updated < startOfToday)
  return [
    { id: "today" as const, items: today },
    { id: "earlier" as const, items: earlier },
  ].filter((group) => group.items.length > 0)
}

export function filterSessionList<T extends SessionListItem>(items: T[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => item.title.toLowerCase().includes(needle))
}
