export const tones = ["green", "blue", "yellow", "red", "grey"] as const

export type StatusTone = (typeof tones)[number]

const byState: Record<string, StatusTone> = {
  running: "green",
  active: "green",
  connected: "green",
  ready: "green",
  ok: "green",
  busy: "blue",
  syncing: "blue",
  streaming: "blue",
  working: "blue",
  starting: "yellow",
  connecting: "yellow",
  waiting: "yellow",
  warning: "yellow",
  pending: "yellow",
  failed: "red",
  error: "red",
  disconnected: "red",
  crashed: "red",
}

export function statusToTone(state: string | undefined): StatusTone {
  return byState[(state ?? "").trim().toLowerCase()] ?? "grey"
}
