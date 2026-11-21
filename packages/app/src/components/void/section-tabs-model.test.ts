import { describe, expect, test } from "bun:test"
import { sectionForRoute, sectionTarget, visibleSections, voidSections } from "./section-tabs-model"

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

  test("the hub route is the hub section", () => {
    expect(sectionForRoute({ type: "hub" })).toBe("hub")
  })

  test("the hub section is visible and has a route", () => {
    expect(voidSections.map((item) => item.id)).toEqual(["overview", "chat", "agents", "models", "hub", "settings"])
    expect(visibleSections().map((item) => item.id)).toEqual(["overview", "chat", "agents", "models", "hub", "settings"])
    expect(sectionTarget("hub")).toEqual({ type: "hub" })
  })

  test("section targets point at the existing routes", () => {
    expect(sectionTarget("overview")).toEqual({ type: "home" })
    expect(sectionTarget("chat")).toEqual({ type: "chat" })
    expect(sectionTarget("agents")).toEqual({ type: "settings", page: "agents" })
    expect(sectionTarget("models")).toEqual({ type: "settings", page: "models" })
    expect(sectionTarget("settings")).toEqual({ type: "settings", page: "settings" })
  })
})
