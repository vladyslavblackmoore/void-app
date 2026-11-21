import { describe, expect, test } from "bun:test"
import { filterOverview, overviewState, overviewStats, type OverviewSession } from "./overview-model"

const list: OverviewSession[] = [
  { id: "a", working: true, waiting: false },
  { id: "b", working: true, waiting: true },
  { id: "c", working: false, waiting: false },
  { id: "d", working: false, waiting: true },
]

describe("overview model", () => {
  test("a waiting session is waiting even while working", () => {
    expect(overviewState(list[1])).toBe("waiting")
    expect(overviewState(list[0])).toBe("running")
    expect(overviewState(list[2])).toBe("idle")
  })

  test("stats count sessions, running and waiting", () => {
    expect(overviewStats(list)).toEqual({ sessions: 4, running: 1, needsYou: 2 })
  })

  test("stats of an empty list are zero", () => {
    expect(overviewStats([])).toEqual({ sessions: 0, running: 0, needsYou: 0 })
  })

  test("filters keep order", () => {
    expect(filterOverview(list, "all").map((item) => item.id)).toEqual(["a", "b", "c", "d"])
    expect(filterOverview(list, "running").map((item) => item.id)).toEqual(["a"])
    expect(filterOverview(list, "waiting").map((item) => item.id)).toEqual(["b", "d"])
  })
})
