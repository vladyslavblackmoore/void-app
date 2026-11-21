import { describe, expect, test } from "bun:test"
import { VOID_MODEL_UNAVAILABLE, neutralErrorText } from "./error-text"

const upstream =
  "This version of OpenCode Desktop no longer supports free models. Update to the latest version: https://opencode.ai/download"

describe("neutralErrorText", () => {
  test("maps the upstream product message to a neutral line under the void theme", () => {
    expect(neutralErrorText(upstream, true)).toBe("This model is not available. Choose another model.")
    expect(VOID_MODEL_UNAVAILABLE).toBe("This model is not available. Choose another model.")
  })

  test("maps any text naming the upstream site", () => {
    expect(neutralErrorText("see opencode.ai/docs", true)).toBe(VOID_MODEL_UNAVAILABLE)
  })

  test("keeps the text under other themes", () => {
    expect(neutralErrorText(upstream, false)).toBe(upstream)
  })

  test("keeps unrelated text under the void theme", () => {
    expect(neutralErrorText("Rate limit reached", true)).toBe("Rate limit reached")
  })

  test("reads the active theme from the document by default", () => {
    const dataset: Record<string, string> = { theme: "void" }
    Object.assign(globalThis, { document: { documentElement: { dataset } } })
    expect(neutralErrorText(upstream)).toBe(VOID_MODEL_UNAVAILABLE)
    dataset.theme = "oc-2"
    expect(neutralErrorText(upstream)).toBe(upstream)
    Reflect.deleteProperty(globalThis, "document")
  })
})
