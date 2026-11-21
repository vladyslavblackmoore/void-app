import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { themeCanvas } from "./canvas"

describe("themeCanvas", () => {
  test("uses the void canvas for the void theme", () => {
    expect(themeCanvas("void", true)).toBe("#0c0d0f")
    expect(themeCanvas("void", false)).toBe("#eceef1")
  })

  test("keeps the shared canvas for every other theme", () => {
    expect(themeCanvas("oc-2", true)).toBe("#080808")
    expect(themeCanvas("oc-2", false)).toBe("#fafafa")
    expect(themeCanvas("nightowl", true)).toBe("#080808")
  })

  test("is used by the theme context", () => {
    const source = readFileSync(new URL("./context.tsx", import.meta.url), "utf8")
    expect(source).toContain("themeCanvas(themeId, isDark)")
    expect(source).not.toContain('"#080808"')
  })
})
