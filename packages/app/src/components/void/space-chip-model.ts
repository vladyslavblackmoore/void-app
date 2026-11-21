export type SpaceCore = "running" | "stopped"

const fallbackColor = "var(--void-space-void)"
const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function spaceChipColor(color: string | undefined) {
  return color && hex.test(color) ? color : fallbackColor
}

export function spaceCore(space: { running: boolean } | undefined): SpaceCore {
  return space?.running ? "running" : "stopped"
}
