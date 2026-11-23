import { describe, expect, test } from "bun:test"
import { fallbackSessionTitle, isDefaultSessionTitle } from "./session-title"

describe("isDefaultSessionTitle", () => {
  test("detects the timestamped defaults only", () => {
    expect(isDefaultSessionTitle("New session - 2026-11-23T10:00:00.000Z")).toBe(true)
    expect(isDefaultSessionTitle("Child session - 2026-11-23T10:00:00.000Z")).toBe(true)
    expect(isDefaultSessionTitle("Fix the build")).toBe(false)
    expect(isDefaultSessionTitle(undefined)).toBe(false)
  })
})

describe("fallbackSessionTitle", () => {
  test("collapses whitespace and truncates", () => {
    expect(fallbackSessionTitle("Fix\n the   build")).toBe("Fix the build")
    expect(fallbackSessionTitle("x".repeat(100))).toHaveLength(60)
    expect(fallbackSessionTitle(undefined)).toBe("")
  })
})
