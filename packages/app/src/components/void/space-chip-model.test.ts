import { describe, expect, test } from "bun:test"
import { spaceChipColor, spaceCore } from "./space-chip-model"

describe("space chip model", () => {
  test("accepts hex colours", () => {
    expect(spaceChipColor("#9B8CFF")).toBe("#9B8CFF")
    expect(spaceChipColor("#abc")).toBe("#abc")
    expect(spaceChipColor("#11223344")).toBe("#11223344")
  })

  test("falls back to the void space colour for anything else", () => {
    expect(spaceChipColor(undefined)).toBe("var(--void-space-void)")
    expect(spaceChipColor("")).toBe("var(--void-space-void)")
    expect(spaceChipColor("red")).toBe("var(--void-space-void)")
    expect(spaceChipColor("#12")).toBe("var(--void-space-void)")
    expect(spaceChipColor("#123456; background: url(x)")).toBe("var(--void-space-void)")
  })

  test("core state follows the running flag", () => {
    expect(spaceCore({ running: true })).toBe("running")
    expect(spaceCore({ running: false })).toBe("stopped")
    expect(spaceCore(undefined)).toBe("stopped")
  })
})
