import { describe, expect, test } from "bun:test"
import { statusToTone, tones } from "./status-to-tone"

describe("statusToTone", () => {
  test("maps active and connected states to green", () => {
    for (const state of ["running", "active", "connected", "ready", "ok"]) expect(statusToTone(state)).toBe("green")
  })

  test("maps data in flight to blue", () => {
    for (const state of ["busy", "syncing", "streaming", "working"]) expect(statusToTone(state)).toBe("blue")
  })

  test("maps states that need attention to yellow", () => {
    for (const state of ["starting", "connecting", "waiting", "warning", "pending"]) {
      expect(statusToTone(state)).toBe("yellow")
    }
  })

  test("maps failures to red", () => {
    for (const state of ["failed", "error", "disconnected", "crashed"]) expect(statusToTone(state)).toBe("red")
  })

  test("maps idle, stopped and unknown states to grey", () => {
    for (const state of ["idle", "stopped", "disabled", "unknown", "something-else", "", undefined]) {
      expect(statusToTone(state)).toBe("grey")
    }
  })

  test("ignores case and surrounding whitespace", () => {
    expect(statusToTone(" Running ")).toBe("green")
    expect(statusToTone("FAILED")).toBe("red")
  })

  test("lists every tone once", () => {
    expect([...tones].sort()).toEqual(["blue", "green", "grey", "red", "yellow"])
  })
})

describe("status dot v2", () => {
  test("ships a component, a stylesheet and a story that cover every tone", async () => {
    const { existsSync, readFileSync } = await import("node:fs")
    const dir = new URL("./", import.meta.url)
    for (const name of ["status-dot-v2.tsx", "status-dot-v2.css", "status-dot-v2.stories.tsx"]) {
      expect(existsSync(new URL(name, dir))).toBe(true)
    }
    const css = readFileSync(new URL("status-dot-v2.css", dir), "utf8")
    for (const tone of tones) expect(css).toContain(`[data-tone="${tone}"]`)
    expect(css).toContain("[data-glow]")
  })
})
