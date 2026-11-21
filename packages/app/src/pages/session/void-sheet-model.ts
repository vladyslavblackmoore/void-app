export type SheetStatus = "waiting" | "running" | "idle"
export type SheetView = "chat" | "tasks"

export const VOID_THREAD_GAP = 18
export const SHEET_HEADER_HEIGHT = 64

export function sheetStatus(input: { waiting: boolean; working: boolean }): SheetStatus {
  if (input.waiting) return "waiting"
  return input.working ? "running" : "idle"
}

export function sheetTabs(input: { void: boolean }): SheetView[] {
  return input.void ? ["chat", "tasks"] : []
}

export function sheetView(input: { void: boolean; requested: SheetView }): SheetView {
  return input.void ? input.requested : "chat"
}

export function sheetHeaderOffset(input: { header: boolean; void: boolean }) {
  if (!input.header) return 0
  return SHEET_HEADER_HEIGHT + (input.void ? VOID_THREAD_GAP : 0)
}

export function reviewToggleVisible(input: { desktop: boolean; void: boolean }) {
  return input.desktop && !input.void
}
