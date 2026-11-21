export type SpaceCore = "running" | "stopped"
export type SpaceRowCore = "running" | "starting" | "failed" | "stopped"

const fallbackColor = "var(--void-space-void)"
const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const identity: Record<string, string> = {
  home: "var(--void-space-home)",
  void: "var(--void-space-void)",
  work: "var(--void-space-work)",
}

export function spaceChipColor(color: string | undefined) {
  return color && hex.test(color) ? color : fallbackColor
}

export function spaceIdentityColor(space: { id: string; color: string | undefined }) {
  return identity[space.id] ?? spaceChipColor(space.color)
}

export function spaceCore(space: { running: boolean } | undefined): SpaceCore {
  return space?.running ? "running" : "stopped"
}

export function spaceRowCore(
  space: { running: boolean } | undefined,
  live: "restarting" | "up" | "failed" | undefined,
): SpaceRowCore {
  if (live === "restarting") return "starting"
  if (live === "failed") return "failed"
  if (live === "up") return "running"
  return spaceCore(space)
}
