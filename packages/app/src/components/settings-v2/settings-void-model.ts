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

export function spaceRows(spaces: SpaceSummary[], starting: ReadonlySet<string>) {
  return spaces.map((space) => {
    const core: SpaceRowCore = space.running ? "running" : starting.has(space.id) ? "starting" : "stopped"
    return {
      id: space.id,
      name: space.name,
      class: space.class,
      color: spaceChipColor(space.color),
      core,
      canStart: core === "stopped",
    }
  })
}

export function resetButtonVariant(isVoid: boolean) {
  return isVoid ? "neutral" : "ghost"
}
