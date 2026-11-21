import type { ColorScheme } from "@opencode-ai/ui/theme/context"
import type { SpaceSummary } from "../../spaces/types"
import { spaceChipColor } from "../void/space-chip-model"

export const schemeSegments = [
  { value: "dark", label: "theme.scheme.dark" },
  { value: "light", label: "theme.scheme.light" },
  { value: "system", label: "theme.scheme.system" },
] as const satisfies readonly { value: ColorScheme; label: string }[]

export function isColorScheme(value: string | null): value is ColorScheme {
  return schemeSegments.some((segment) => segment.value === value)
}

export type SpaceRowCore = "running" | "starting" | "stopped"
export type SpaceRowAction = "start" | "stop" | "starting"

export function spaceRows(
  spaces: SpaceSummary[],
  starting: ReadonlySet<string>,
  extras: { defaultId?: string; sessions?: Readonly<Record<string, number>> } = {},
) {
  return spaces.map((space) => {
    const core: SpaceRowCore = space.running ? "running" : starting.has(space.id) ? "starting" : "stopped"
    const action: SpaceRowAction = core === "running" ? "stop" : core === "starting" ? "starting" : "start"
    return {
      id: space.id,
      name: space.name,
      class: space.class,
      color: spaceChipColor(space.color),
      core,
      action,
      canStart: action === "start",
      isDefault: extras.defaultId === space.id,
      sessions: extras.sessions?.[space.id],
    }
  })
}

export function sessionsKey(count: number | undefined) {
  if (count === undefined) return undefined
  return count === 1 ? "void.settings.spaces.sessionOne" : "void.settings.spaces.sessionMany"
}

export function notificationsEnabled(notifications: { agent: boolean; permissions: boolean; errors: boolean }) {
  return notifications.agent || notifications.permissions || notifications.errors
}

export function resetButtonVariant(isVoid: boolean) {
  return isVoid ? "neutral" : "ghost"
}

export function voidGeneralLayout(input: { spaces: boolean; dataFolder: boolean }) {
  return {
    left: ["general", "appearance"],
    right: [...(input.spaces ? ["spaces", "defaultSpace"] : []), ...(input.dataFolder ? ["data"] : [])],
  }
}

export function voidDataFolder(home: string | undefined) {
  if (!home) return undefined
  return { path: `${home}/void`, label: "~/void" }
}
