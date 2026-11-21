import { describe, expect, test } from "bun:test"
import { ServerConnection } from "@/context/server"
import { HOME_SPACE_ID, type SpaceSummary, type SpacesPlatform } from "./types"
import { spaceConnection } from "./connection"
import { menuSpaces, switchToSpace } from "./model"

const summary = (id: string, extra: Partial<SpaceSummary> = {}): SpaceSummary => ({
  id,
  name: id.toUpperCase(),
  color: "#123456",
  class: "personal",
  running: false,
  busy: false,
  ...extra,
})

function platformSpaces(log: string[], fail?: string): SpacesPlatform {
  return {
    list: async () => [summary("home"), summary("void")],
    start: async (id) => {
      log.push(`start:${id}`)
      if (id === fail) throw new Error("boom")
      return { url: `http://127.0.0.1:${id === "home" ? 1 : 2}`, username: "opencode", password: `pw-${id}` }
    },
    getViewed: async () => HOME_SPACE_ID,
    setViewed: async (id) => {
      log.push(`viewed:${id}`)
    },
  }
}

describe("spaceConnection", () => {
  test("describes the core of a space as a sidecar connection with its credentials", () => {
    const conn = spaceConnection(summary("void", { name: "VOID" }), {
      url: "http://127.0.0.1:2",
      username: "opencode",
      password: "pw",
    })
    expect(conn).toMatchObject({
      type: "sidecar",
      variant: "base",
      space: "void",
      displayName: "VOID",
      http: { url: "http://127.0.0.1:2", username: "opencode", password: "pw" },
    })
    expect(ServerConnection.key(conn) as string).toBe("sidecar:void")
  })

  test("keeps the legacy key for home", () => {
    const conn = spaceConnection(summary("home"), { url: "http://127.0.0.1:1", username: "opencode", password: "pw" })
    expect(ServerConnection.key(conn) as string).toBe("sidecar")
  })
})

describe("switchToSpace", () => {
  test("starts the core, registers it, activates it and then records the viewed space", async () => {
    const log: string[] = []
    const registered: ServerConnection.Any[] = []
    await switchToSpace({
      spaces: platformSpaces(log),
      summary: summary("void"),
      register: (conn) => registered.push(conn),
      activate: (key) => log.push(`active:${key}`),
    })
    expect(log).toEqual(["start:void", "active:sidecar:void", "viewed:void"])
    expect(registered).toHaveLength(1)
    expect(registered[0]?.http.password).toBe("pw-void")
  })

  test("never stops the space left behind", async () => {
    const log: string[] = []
    await switchToSpace({
      spaces: platformSpaces(log),
      summary: summary("void"),
      register: () => undefined,
      activate: () => undefined,
    })
    expect(log.some((entry) => entry.startsWith("stop"))).toBe(false)
  })

  test("leaves the active connection alone when the core does not start", async () => {
    const log: string[] = []
    await expect(
      switchToSpace({
        spaces: platformSpaces(log, "void"),
        summary: summary("void"),
        register: () => log.push("register"),
        activate: () => log.push("activate"),
      }),
    ).rejects.toThrow("boom")
    expect(log).toEqual(["start:void"])
  })
})

describe("menuSpaces", () => {
  test("marks the viewed space and exposes names, colours and the busy flag only", () => {
    const items = menuSpaces([summary("home", { busy: true }), summary("void")], "void")
    expect(items.map((item) => [item.id, item.viewed, item.busy])).toEqual([
      ["home", false, true],
      ["void", true, false],
    ])
    expect(Object.keys(items[0]!).sort()).toEqual(["busy", "color", "id", "name", "viewed"])
  })
})
