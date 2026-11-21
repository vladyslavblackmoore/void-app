import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { freeModelsTitleKey } from "./model-picker-copy"

const en = readFileSync(new URL("../i18n/en.ts", import.meta.url), "utf8")

describe("model picker copy", () => {
  test("void theme uses the unbranded free models title", () => {
    expect(freeModelsTitleKey("void")).toBe("dialog.model.unpaid.freeModels.voidTitle")
  })

  test("other themes keep the upstream title key", () => {
    expect(freeModelsTitleKey("oc-2")).toBe("dialog.model.unpaid.freeModels.title")
    expect(freeModelsTitleKey(undefined)).toBe("dialog.model.unpaid.freeModels.title")
  })

  test("the void title has no upstream name", () => {
    expect(en).toContain('"dialog.model.unpaid.freeModels.voidTitle": "Free models"')
  })
})
