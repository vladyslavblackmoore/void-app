export const densityOptions = ["comfortable", "compact"] as const

export type Density = (typeof densityOptions)[number]

export type VoidAppearance = {
  glows: boolean
  dotGrid: boolean
  reduceMotion: boolean
  density: Density
}

export function isDensity(value: string | undefined): value is Density {
  return densityOptions.some((option) => option === value)
}

export function voidAppearanceAttributes(appearance: VoidAppearance) {
  return {
    "data-void-glows": appearance.glows ? undefined : "off",
    "data-void-grid": appearance.dotGrid ? undefined : "off",
    "data-void-motion": appearance.reduceMotion ? "reduced" : undefined,
    "data-void-density": appearance.density === "compact" ? "compact" : undefined,
  } satisfies Record<string, string | undefined>
}
