import { describe, expect, test } from "bun:test"
import { createQuitOrigin } from "./quit-origin"

function setup() {
  const calls: unknown[][] = []
  const origin = createQuitOrigin()
  const log = (...args: unknown[]) => calls.push(args)
  return { calls, origin, log }
}

describe("quit origin", () => {
  test("logs an external quit when no user path marked it", () => {
    const { calls, origin, log } = setup()
    origin.logQuit(log)
    expect(calls).toEqual([["main", "app quitting", { userInitiated: false }]])
  })

  test("logs a user-initiated quit after the mark", () => {
    const { calls, origin, log } = setup()
    origin.markUserQuit()
    origin.logQuit(log)
    expect(calls).toEqual([["main", "app quitting", { userInitiated: true }]])
  })

  test("logs once when before-quit fires again for the same quit", () => {
    const { calls, origin, log } = setup()
    origin.markUserQuit()
    origin.logQuit(log)
    origin.logQuit(log)
    expect(calls).toHaveLength(1)
  })

  test("a cleared mark logs an external quit", () => {
    const { calls, origin, log } = setup()
    origin.markUserQuit()
    origin.clearUserQuit()
    origin.logQuit(log)
    expect(calls).toEqual([["main", "app quitting", { userInitiated: false }]])
  })
})
