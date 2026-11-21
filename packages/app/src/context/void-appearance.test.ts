import { describe, expect, test } from "bun:test"
import { densityOptions, isDensity, voidAppearanceAttributes } from "./void-appearance"

describe("void appearance attributes", () => {
  test("the defaults set no attribute", () => {
    expect(voidAppearanceAttributes({ glows: true, dotGrid: true, reduceMotion: false, density: "comfortable" })).toEqual({
      "data-void-glows": undefined,
      "data-void-grid": undefined,
      "data-void-motion": undefined,
      "data-void-density": undefined,
    })
  })

  test("every changed value maps to its attribute", () => {
    expect(voidAppearanceAttributes({ glows: false, dotGrid: false, reduceMotion: true, density: "compact" })).toEqual({
      "data-void-glows": "off",
      "data-void-grid": "off",
      "data-void-motion": "reduced",
      "data-void-density": "compact",
    })
  })
})

describe("density", () => {
  test("lists comfortable and compact", () => {
    expect(densityOptions).toEqual(["comfortable", "compact"])
  })

  test("accepts only known densities", () => {
    expect(isDensity("compact")).toBe(true)
    expect(isDensity("huge")).toBe(false)
    expect(isDensity(undefined)).toBe(false)
  })
})
