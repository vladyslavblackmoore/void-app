import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  SHEET_HEADER_HEIGHT,
  VOID_THREAD_GAP,
  reviewToggleVisible,
  sheetHeaderOffset,
  sheetStatus,
  sheetTabs,
  sheetView,
  todoTone,
} from "./void-sheet-model"

describe("void sheet model", () => {
  test("derives the dot state from waiting and working", () => {
    expect(sheetStatus({ waiting: true, working: true })).toBe("waiting")
    expect(sheetStatus({ waiting: true, working: false })).toBe("waiting")
    expect(sheetStatus({ waiting: false, working: true })).toBe("running")
    expect(sheetStatus({ waiting: false, working: false })).toBe("idle")
  })

  test("maps todo states to dot tones", () => {
    expect(todoTone("completed")).toBe("green")
    expect(todoTone("in_progress")).toBe("yellow")
    expect(todoTone("pending")).toBe("grey")
  })

  test("the status, the todo row and the tasks inset are defined once", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
    const head = read("./timeline/void-sheet-head.tsx")
    const details = read("./void-run-details.tsx")
    const view = read("./void-run-view.tsx")
    expect(head).toContain("createSheetStatus")
    expect(details).toContain("createSheetStatus")
    expect(head).not.toContain("sessionPermissionRequest")
    expect(details).not.toContain("sessionPermissionRequest")
    expect(head).toContain("VoidTodoRow")
    expect(view).toContain("VoidTodoRow")
    expect(read("./void-run-model.ts")).not.toContain("RunStatus")
    const css = read("../../../../ui/src/styles/void/chat.css")
    expect(css).toContain(`--void-sheet-header: ${SHEET_HEADER_HEIGHT}px`)
    expect(css).toContain(`--void-thread-gap: ${VOID_THREAD_GAP}px`)
    expect(css).not.toContain("inset: 66px")
    expect(read("./void-session-sheets.css")).not.toContain("void-run-todo")
  })

  test("shows the Chat and Tasks tabs only under the void theme", () => {
    expect(sheetTabs({ void: true })).toEqual(["chat", "tasks"])
    expect(sheetTabs({ void: false })).toEqual([])
  })

  test("switches the view under void and stays on chat otherwise", () => {
    expect(sheetView({ void: true, requested: "tasks" })).toBe("tasks")
    expect(sheetView({ void: true, requested: "chat" })).toBe("chat")
    expect(sheetView({ void: false, requested: "tasks" })).toBe("chat")
  })

  test("adds the thread gap to the scroll margin only under void with a header", () => {
    expect(sheetHeaderOffset({ header: true, void: false })).toBe(64)
    expect(sheetHeaderOffset({ header: true, void: true })).toBe(64 + VOID_THREAD_GAP)
    expect(sheetHeaderOffset({ header: false, void: true })).toBe(0)
  })

  test("hides the review toggle under void and keeps it elsewhere on desktop", () => {
    expect(reviewToggleVisible({ desktop: true, void: true })).toBe(false)
    expect(reviewToggleVisible({ desktop: true, void: false })).toBe(true)
    expect(reviewToggleVisible({ desktop: false, void: false })).toBe(false)
  })

  test("the css thread gap equals the model constant", () => {
    const css = readFileSync(new URL("../../../../ui/src/styles/void/chat.css", import.meta.url), "utf8")
    expect(css).toContain(`margin-bottom: ${VOID_THREAD_GAP}px`)
  })
})
