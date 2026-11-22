import { describe, expect, test } from "bun:test"
import {
  agentRowTitle,
  agentRunState,
  buildAgentTree,
  stripDelegationMarker,
  stripWorkerNote,
  withoutRemoved,
  withoutWorkerNote,
} from "./agents-tree"

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

  test("maps an aborted last reply to aborted and keeps running above it", () => {
    expect(agentRunState({ type: "idle" }, true, true)).toBe("aborted")
    expect(agentRunState(undefined, false, true)).toBe("aborted")
    expect(agentRunState({ type: "busy" }, true, true)).toBe("running")
  })
})

describe("agentRowTitle", () => {
  test("drops the delegate prefix and the worker marker", () => {
    expect(agentRowTitle("delegate: Fix the build")).toBe("Fix the build")
    expect(agentRowTitle("delegate: [delegated worker] Fix")).toBe("Fix")
    expect(agentRowTitle("[delegated worker] Fix")).toBe("Fix")
  })

  test("keeps other titles and handles undefined", () => {
    expect(agentRowTitle("Plain delegate: x")).toBe("Plain delegate: x")
    expect(agentRowTitle(undefined)).toBe("")
  })
})

describe("stripWorkerNote", () => {
  test("removes the whole worker note paragraph", () => {
    const note = "[delegated worker] You are a child session. Do the task.\nDo not use delegate.\n\nFix the build"
    expect(stripWorkerNote(note)).toBe("Fix the build")
  })

  test("removes only the marker when no paragraph break follows", () => {
    expect(stripWorkerNote("[delegated worker] Fix")).toBe("Fix")
  })

  test("keeps text without a leading marker", () => {
    expect(stripWorkerNote("Fix [delegated worker]\n\nnow")).toBe("Fix [delegated worker]\n\nnow")
  })
})

describe("withoutWorkerNote", () => {
  test("strips text parts and keeps other parts and identity", () => {
    const text = { type: "text", text: "[delegated worker] note\n\nTask" }
    const tool = { type: "tool", text: "" }
    const result = withoutWorkerNote([text, tool])
    expect(result[0]).toEqual({ type: "text", text: "Task" })
    expect(result[1]).toBe(tool)
    const clean = [{ type: "text", text: "Task" }]
    expect(withoutWorkerNote(clean)).toBe(clean)
  })
})

describe("withoutRemoved", () => {
  test("drops removed ids and keeps the same array when nothing was removed", () => {
    const list = [{ id: "a" }, { id: "b" }]
    expect(withoutRemoved(list, new Set(["b"]))).toEqual([{ id: "a" }])
    expect(withoutRemoved(list, new Set())).toBe(list)
  })
})
