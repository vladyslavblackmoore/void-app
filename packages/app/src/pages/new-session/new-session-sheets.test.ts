import { describe, expect, test } from "bun:test"
import { newSessionSheets } from "./new-session-sheets"

describe("newSessionSheets", () => {
  test("renders the sessions and run details panels only under the void theme on desktop", () => {
    expect(newSessionSheets({ void: true, desktop: true })).toBe(true)
    expect(newSessionSheets({ void: false, desktop: true })).toBe(false)
    expect(newSessionSheets({ void: true, desktop: false })).toBe(false)
    expect(newSessionSheets({ void: false, desktop: false })).toBe(false)
  })
})
