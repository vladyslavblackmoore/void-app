import { describe, expect, test } from "bun:test"
import { DEFAULT_THEME_ID, resolveThemeId } from "./default-theme"

describe("default theme", () => {
  test("the default theme is void", () => {
    expect(DEFAULT_THEME_ID).toBe("void")
  })

  test("a fresh install resolves to void", () => {
    expect(resolveThemeId(null, undefined)).toBe("void")
    expect(resolveThemeId(undefined, undefined)).toBe("void")
  })

  test("an explicit stored theme is kept, including oc-2", () => {
    expect(resolveThemeId("oc-2", undefined)).toBe("oc-2")
    expect(resolveThemeId("nightowl", "void")).toBe("nightowl")
  })

  test("the provider default applies when nothing is stored", () => {
    expect(resolveThemeId(null, "nord")).toBe("nord")
  })

  test("the legacy oc-1 id maps to oc-2", () => {
    expect(resolveThemeId("oc-1", undefined)).toBe("oc-2")
  })
})
