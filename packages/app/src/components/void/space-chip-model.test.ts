import { describe, expect, test } from "bun:test"
import { spaceCardModel, spaceChipColor, spaceCore, spaceIdentityColor, spaceRowCore } from "./space-chip-model"

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

  test("known space ids map to the identity tokens", () => {
    expect(spaceIdentityColor({ id: "home", color: "#4f8cff" })).toBe("var(--void-space-home)")
    expect(spaceIdentityColor({ id: "void", color: "#4f8cff" })).toBe("var(--void-space-void)")
    expect(spaceIdentityColor({ id: "work", color: "#336699" })).toBe("var(--void-space-work)")
  })

  test("other spaces keep their own colour or fall back to the void token", () => {
    expect(spaceIdentityColor({ id: "lab", color: "#336699" })).toBe("#336699")
    expect(spaceIdentityColor({ id: "lab", color: "teal" })).toBe("var(--void-space-void)")
  })

  test("row core state follows the running flag and the live core status", () => {
    expect(spaceRowCore({ running: true }, undefined)).toBe("running")
    expect(spaceRowCore({ running: false }, undefined)).toBe("stopped")
    expect(spaceRowCore({ running: false }, "restarting")).toBe("starting")
    expect(spaceRowCore({ running: true }, "restarting")).toBe("starting")
    expect(spaceRowCore({ running: false }, "failed")).toBe("failed")
    expect(spaceRowCore({ running: false }, "up")).toBe("running")
    expect(spaceRowCore(undefined, undefined)).toBe("stopped")
  })
})

describe("space card model", () => {
  const spaces = [
    { id: "void", name: "VOID", color: undefined, running: true },
    { id: "work", name: "Work", color: "#123456", running: false },
  ]

  test("describes the viewed space with its core state", () => {
    expect(spaceCardModel(spaces, "void", undefined)).toEqual({
      name: "VOID",
      color: "var(--void-space-void)",
      core: "running",
    })
    expect(spaceCardModel(spaces, "work", undefined)?.core).toBe("stopped")
  })

  test("a live core status wins over the running flag", () => {
    expect(spaceCardModel(spaces, "void", "restarting")?.core).toBe("starting")
    expect(spaceCardModel(spaces, "void", "failed")?.core).toBe("failed")
  })

  test("is undefined when the viewed space is unknown", () => {
    expect(spaceCardModel(spaces, "other", undefined)).toBeUndefined()
    expect(spaceCardModel(spaces, undefined, undefined)).toBeUndefined()
  })
})
