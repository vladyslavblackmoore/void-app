import { describe, expect, test } from "bun:test"
import { ServerConnection } from "@/context/server"
import { HOME_SPACE_ID, type SpaceSummary, type SpacesPlatform } from "./types"
import { spaceConnection } from "./connection"
import { endpointSignature } from "./connection"
import { applyCoreStatus, menuSpaces, visibleCoreState, switchToSpace } from "./model"

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
    start: async (id) => ({ url: `http://127.0.0.1:${id === "home" ? 1 : 2}`, username: "opencode", password: `pw-${id}` }),
    getViewed: async () => HOME_SPACE_ID,
    setViewed: async (id) => {
      log.push(`viewed:${id}`)
      if (id === fail) throw new Error("boom")
      return { url: `http://127.0.0.1:${id === "home" ? 1 : 2}`, username: "opencode", password: `pw-${id}` }
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
  test("views the space for this window, then registers and activates the endpoint it returns", async () => {
    const log: string[] = []
    const registered: ServerConnection.Any[] = []
    await switchToSpace({
      spaces: platformSpaces(log),
      summary: summary("void"),
      register: (conn) => registered.push(conn),
      activate: (key) => log.push(`active:${key}`),
    })
    expect(log).toEqual(["viewed:void", "active:sidecar:void"])
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
    expect(log).toEqual(["viewed:void"])
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

describe("applyCoreStatus", () => {
  const endpoint = { url: "http://127.0.0.1:9", username: "opencode", password: "new" }

  test("reconnects the viewed space to the restarted core", () => {
    const registered: unknown[] = []
    const activated: string[] = []
    const shown = applyCoreStatus({
      status: { space: "void", state: "up", endpoint },
      viewed: "void",
      name: "VOID",
      register: (conn) => registered.push(conn),
      activate: (key) => activated.push(key),
    })
    expect(shown).toBe("up")
    expect(registered).toEqual([spaceConnection({ id: "void", name: "VOID" }, endpoint)])
    expect(activated).toEqual(["sidecar:void"])
  })

  test("reports restarting and failed without touching the connection", () => {
    const registered: unknown[] = []
    for (const state of ["restarting", "failed"] as const) {
      const shown = applyCoreStatus({
        status: { space: "void", state },
        viewed: "void",
        name: "VOID",
        register: (conn) => registered.push(conn),
        activate: () => registered.push("activate"),
      })
      expect(shown).toBe(state)
    }
    expect(registered).toEqual([])
  })

  test("ignores a status of a space that is not viewed", () => {
    const registered: unknown[] = []
    const shown = applyCoreStatus({
      status: { space: "work", state: "up", endpoint },
      viewed: "void",
      name: "VOID",
      register: (conn) => registered.push(conn),
      activate: () => registered.push("activate"),
    })
    expect(shown).toBeUndefined()
    expect(registered).toEqual([])
  })
})

describe("endpointSignature", () => {
  test("changes with the url or the password", () => {
    const base = { http: { url: "http://127.0.0.1:1", username: "opencode", password: "a" } }
    expect(endpointSignature(base)).toBe(endpointSignature({ http: { ...base.http } }))
    expect(endpointSignature(base)).not.toBe(endpointSignature({ http: { ...base.http, url: "http://127.0.0.1:2" } }))
    expect(endpointSignature(base)).not.toBe(endpointSignature({ http: { ...base.http, password: "b" } }))
  })
})

describe("visibleCoreState", () => {
  test("shows a state only for the viewed space", () => {
    expect(visibleCoreState({ space: "a", state: "restarting" }, "a")).toBe("restarting")
    expect(visibleCoreState({ space: "a", state: "failed" }, "b")).toBeUndefined()
    expect(visibleCoreState(undefined, "a")).toBeUndefined()
  })
})
