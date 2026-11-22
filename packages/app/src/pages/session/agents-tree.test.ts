import { describe, expect, test } from "bun:test"
import { agentRunState, buildAgentTree, stripDelegationMarker, withoutRemoved } from "./agents-tree"

const session = (id: string, parentID: string | undefined, created: number) => ({
  id,
  parentID,
  time: { created },
})

describe("stripDelegationMarker", () => {
  test("removes a single leading marker", () => {
    expect(stripDelegationMarker("[delegated worker] Fix the build")).toBe("Fix the build")
  })

  test("removes every leading occurrence with surrounding whitespace", () => {
    expect(stripDelegationMarker("  [delegated worker]  [delegated worker]\n[delegated worker] Fix")).toBe("Fix")
  })

  test("keeps markers that are not leading", () => {
    expect(stripDelegationMarker("Fix [delegated worker] now")).toBe("Fix [delegated worker] now")
  })

  test("returns an empty string for a title that is only the marker", () => {
    expect(stripDelegationMarker("[delegated worker] [delegated worker]")).toBe("")
  })

  test("passes through titles without a marker and undefined", () => {
    expect(stripDelegationMarker("Plain")).toBe("Plain")
    expect(stripDelegationMarker(undefined)).toBeUndefined()
  })
})

describe("buildAgentTree", () => {
  test("orders children by creation and nests grandchildren by depth", () => {
    const rows = buildAgentTree(
      [
        session("c2", "root", 20),
        session("c1", "root", 10),
        session("g1", "c1", 30),
        session("other", "unrelated", 5),
        session("root", undefined, 1),
      ],
      "root",
    )
    expect(rows.map((row) => [row.session.id, row.depth])).toEqual([
      ["c1", 1],
      ["g1", 2],
      ["c2", 1],
    ])
  })

  test("caps the depth at 2", () => {
    const rows = buildAgentTree(
      [session("c", "root", 1), session("g", "c", 2), session("gg", "g", 3)],
      "root",
    )
    expect(rows.map((row) => row.session.id)).toEqual(["c", "g"])
  })

  test("hides the descendants of an archived parent", () => {
    const rows = buildAgentTree(
      [
        { ...session("c", "root", 1), time: { created: 1, archived: 9 } },
        session("g", "c", 2),
        session("d", "root", 3),
      ],
      "root",
    )
    expect(rows.map((row) => row.session.id)).toEqual(["d"])
  })

  test("ignores archived sessions and cycles", () => {
    const rows = buildAgentTree(
      [
        { ...session("a", "root", 1), time: { created: 1, archived: 5 } },
        session("b", "root", 2),
        session("root", "b", 0),
      ],
      "root",
    )
    expect(rows.map((row) => row.session.id)).toEqual(["b"])
  })
})

describe("agentRunState", () => {
  test("maps busy and retry to running", () => {
    expect(agentRunState({ type: "busy" }, false)).toBe("running")
    expect(agentRunState({ type: "retry" }, false)).toBe("running")
  })

  test("maps idle or unknown to done, or error when the last reply failed", () => {
    expect(agentRunState({ type: "idle" }, false)).toBe("idle")
    expect(agentRunState(undefined, false)).toBe("idle")
    expect(agentRunState({ type: "idle" }, true)).toBe("error")
  })
})

describe("withoutRemoved", () => {
  test("drops removed ids and keeps the same array when nothing was removed", () => {
    const list = [{ id: "a" }, { id: "b" }]
    expect(withoutRemoved(list, new Set(["b"]))).toEqual([{ id: "a" }])
    expect(withoutRemoved(list, new Set())).toBe(list)
  })
})
