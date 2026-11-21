import { describe, expect, test } from "bun:test"
import { sectionAction, sectionForRoute, sectionTarget, visibleSections, voidSections } from "./section-tabs-model"

describe("section tabs model", () => {
  test("home route is the overview section", () => {
    expect(sectionForRoute({ type: "home" })).toBe("overview")
  })

  test("session, draft and directory draft routes are the chat section", () => {
    expect(sectionForRoute({ type: "session", sessionId: "ses_1" })).toBe("chat")
    expect(sectionForRoute({ type: "draft", draftID: "d1" })).toBe("chat")
    expect(sectionForRoute({ type: "dir-new-sesssion", dir: "/a", dirBase64: "L2E" })).toBe("chat")
  })

  test("settings pages map to their own sections", () => {
    expect(sectionForRoute({ type: "settings", page: "agents" })).toBe("agents")
    expect(sectionForRoute({ type: "settings", page: "models" })).toBe("models")
    expect(sectionForRoute({ type: "settings", page: "settings" })).toBe("settings")
  })

  test("the hub section has no route and is not visible", () => {
    expect(voidSections.map((item) => item.id)).toEqual(["overview", "chat", "agents", "models", "hub", "settings"])
    expect(visibleSections().map((item) => item.id)).toEqual(["overview", "chat", "agents", "models", "settings"])
    expect(sectionTarget("hub")).toBeUndefined()
  })

  test("section targets point at the existing routes", () => {
    expect(sectionTarget("overview")).toEqual({ type: "home" })
    expect(sectionTarget("chat")).toEqual({ type: "chat" })
    expect(sectionTarget("agents")).toEqual({ type: "settings", page: "agents" })
    expect(sectionTarget("models")).toEqual({ type: "settings", page: "models" })
    expect(sectionTarget("settings")).toEqual({ type: "settings", page: "settings" })
  })
})

describe("section action", () => {
  const base = { active: "overview" as const, lastChatKey: undefined, chatKeys: [] as string[] }

  test("selecting the active section does nothing", () => {
    expect(sectionAction({ ...base, section: "overview" })).toEqual({ type: "none" })
  })

  test("hub has no action", () => {
    expect(sectionAction({ ...base, section: "hub" })).toEqual({ type: "none" })
  })

  test("overview and settings pages map to home and settings actions", () => {
    expect(sectionAction({ ...base, active: "chat", section: "overview" })).toEqual({ type: "home" })
    expect(sectionAction({ ...base, section: "models" })).toEqual({ type: "settings", page: "models" })
  })

  test("chat restores the last used chat tab when it is still open", () => {
    expect(sectionAction({ ...base, section: "chat", lastChatKey: "b", chatKeys: ["a", "b", "c"] })).toEqual({
      type: "chat-tab",
      key: "b",
    })
  })

  test("chat falls back to the first open chat tab when the last used one is gone", () => {
    expect(sectionAction({ ...base, section: "chat", lastChatKey: "x", chatKeys: ["a", "b"] })).toEqual({
      type: "chat-tab",
      key: "a",
    })
    expect(sectionAction({ ...base, section: "chat", chatKeys: ["a"] })).toEqual({ type: "chat-tab", key: "a" })
  })

  test("chat opens a new draft when no chat tab is open", () => {
    expect(sectionAction({ ...base, section: "chat" })).toEqual({ type: "chat-new" })
  })
})
