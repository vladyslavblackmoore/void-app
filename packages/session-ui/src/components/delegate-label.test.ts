import { describe, expect, test } from "bun:test"
import { delegateTaskLabel, isDelegateTool, unconfirmedSessionId } from "./delegate-label"

describe("isDelegateTool", () => {
  test("matches every delegate tool name", () => {
    expect(isDelegateTool("delegate")).toBe(true)
    expect(isDelegateTool("delegate_delegate")).toBe(true)
    expect(isDelegateTool("mcp__delegate__delegate")).toBe(true)
    expect(isDelegateTool("task")).toBe(false)
  })
})

describe("delegateTaskLabel", () => {
  test("shortens the task input", () => {
    expect(delegateTaskLabel({ task: "delegate: Read /Users/a/b/notes.md" })).toBe("Read notes.md")
    expect(delegateTaskLabel({ task: "[delegated worker] List files" })).toBe("List files")
    expect(delegateTaskLabel({ task: "[delegated worker] delegate: x" })).toBe("x")
    expect(delegateTaskLabel({ task: "delegate: [delegated worker] x" })).toBe("x")
    expect(delegateTaskLabel(undefined)).toBe("")
  })
})

describe("unconfirmedSessionId", () => {
  const output = "STATUS: UNCONFIRMED - it started a background process\nwarning text\n\nStarted.\n\nsession: ses_abc123"
  test("returns the child session id for an unconfirmed result", () => {
    expect(unconfirmedSessionId(output)).toBe("ses_abc123")
  })
  test("returns an empty string when the status line is present without a session", () => {
    expect(unconfirmedSessionId("STATUS: UNCONFIRMED - x")).toBe("")
  })
  test("returns undefined for a confirmed or empty result", () => {
    expect(unconfirmedSessionId("ok\n\nsession: ses_abc123")).toBeUndefined()
    expect(unconfirmedSessionId(undefined)).toBeUndefined()
    expect(unconfirmedSessionId("see STATUS: UNCONFIRMED later")).toBeUndefined()
  })
})
