import { describe, expect, test } from "bun:test"
import { tooltipProviderName } from "./model-tooltip-provider"

describe("tooltipProviderName", () => {
  test("renders VOID for upstream provider names under the void theme", () => {
    for (const name of ["OpenCode", "OpenCode Zen", "OpenCode Go", "opencode"])
      expect(tooltipProviderName(name, "void")).toBe("VOID")
  })

  test("keeps other provider names under void", () => {
    expect(tooltipProviderName("Anthropic", "void")).toBe("Anthropic")
    expect(tooltipProviderName("OpenAI", "void")).toBe("OpenAI")
  })

  test("keeps every name under other themes", () => {
    expect(tooltipProviderName("OpenCode", "oc-2")).toBe("OpenCode")
    expect(tooltipProviderName("OpenCode Go", undefined)).toBe("OpenCode Go")
  })
})
