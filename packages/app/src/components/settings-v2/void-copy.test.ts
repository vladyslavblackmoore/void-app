import { describe, expect, test } from "bun:test"
import { copyKey, voidCopyKeys } from "./void-copy"

describe("void copy", () => {
  test("keys with an override map to the void key under the void theme", () => {
    expect(copyKey(true, "settings.general.row.language.description")).toBe(
      "void.copy.settings.general.row.language.description",
    )
  })

  test("other themes keep the original key", () => {
    expect(copyKey(false, "settings.general.row.language.description")).toBe(
      "settings.general.row.language.description",
    )
  })

  test("keys without an override are unchanged under the void theme", () => {
    expect(copyKey(true, "settings.general.row.shell.title")).toBe("settings.general.row.shell.title")
  })

  test("every override key is listed once", () => {
    expect(new Set(voidCopyKeys).size).toBe(voidCopyKeys.length)
  })
})
