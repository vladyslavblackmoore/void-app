import { describe, expect, test } from "bun:test"
import { delegateTaskLabel, isDelegateTool } from "./delegate-label"

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
