import { describe, expect, test } from "bun:test"
import { filterSessionList, groupSessionList, type SessionListItem } from "./session-list-model"

const now = new Date(2026, 10, 21, 15, 30).getTime()
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime()

const item = (id: string, updated: number, title = id): SessionListItem => ({ id, title, updated })

describe("session list model", () => {
  test("splits sessions into today and earlier by calendar day", () => {
    const groups = groupSessionList([item("a", at(21, 9)), item("b", at(20, 23)), item("c", at(21, 0))], now)
    expect(groups.map((group) => group.id)).toEqual(["today", "earlier"])
    expect(groups[0]!.items.map((entry) => entry.id)).toEqual(["a", "c"])
    expect(groups[1]!.items.map((entry) => entry.id)).toEqual(["b"])
  })

  test("omits an empty group", () => {
    expect(groupSessionList([item("a", at(21, 9))], now).map((group) => group.id)).toEqual(["today"])
    expect(groupSessionList([item("a", at(1, 9))], now).map((group) => group.id)).toEqual(["earlier"])
    expect(groupSessionList([], now)).toEqual([])
  })

  test("keeps the input order inside a group", () => {
    const groups = groupSessionList([item("x", at(19, 9)), item("y", at(18, 9)), item("z", at(17, 9))], now)
    expect(groups[0]!.items.map((entry) => entry.id)).toEqual(["x", "y", "z"])
  })

  test("a future timestamp counts as today", () => {
    expect(groupSessionList([item("f", at(22, 9))], now)[0]!.id).toBe("today")
  })

  test("filters by a case-insensitive title substring and ignores blank queries", () => {
    const list = [item("a", 1, "Broker fallback"), item("b", 2, "Memory cleanup")]
    expect(filterSessionList(list, "BROKER").map((entry) => entry.id)).toEqual(["a"])
    expect(filterSessionList(list, "  ").map((entry) => entry.id)).toEqual(["a", "b"])
    expect(filterSessionList(list, "zzz")).toEqual([])
  })
})
