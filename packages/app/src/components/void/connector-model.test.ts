import { describe, expect, test } from "bun:test"
import {
  buildTiles,
  connectorCatalog,
  filterCounts,
  filterTiles,
  countTools,
  hubSummary,
  hubServer,
  tileAction,
  tileState,
  tileTone,
} from "./connector-model"

describe("connector model", () => {
  test("maps mcp status to a tile state", () => {
    expect(tileState("connected")).toBe("connected")
    expect(tileState("needs_auth")).toBe("needs_auth")
    expect(tileState("needs_client_registration")).toBe("needs_auth")
    expect(tileState("failed")).toBe("error")
    expect(tileState("disabled")).toBe("disabled")
    expect(tileState("pending")).toBe("disabled")
    expect(tileState(undefined)).toBe("disabled")
  })

  test("maps a tile state to a tone", () => {
    expect(tileTone("connected")).toBe("green")
    expect(tileTone("needs_auth")).toBe("yellow")
    expect(tileTone("error")).toBe("red")
    expect(tileTone("disabled")).toBe("grey")
    expect(tileTone("available")).toBe("grey")
  })

  test("maps a tile state to an action", () => {
    expect(tileAction("connected")).toBe("manage")
    expect(tileAction("needs_auth")).toBe("connect")
    expect(tileAction("error")).toBe("reconnect")
    expect(tileAction("disabled")).toBe("enable")
    expect(tileAction("available")).toBe("setup")
  })

  test("the catalog has a Google Workspace entry with three services", () => {
    const google = connectorCatalog.find((item) => item.id === "google-workspace")
    expect(google?.name).toBe("Google Workspace")
    expect(google?.services).toEqual(["Gmail", "Calendar", "Drive"])
  })

  test("shows the catalog tile as available when no server matches", () => {
    const tiles = buildTiles({})
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({
      id: "google-workspace",
      name: "Google Workspace",
      state: "available",
      tone: "grey",
      configured: false,
      serverName: undefined,
    })
  })

  test("merges a configured google server into the catalog tile", () => {
    const tiles = buildTiles({ google_workspace: { status: "needs_auth" }, files: { status: "connected" } })
    expect(tiles.map((tile) => tile.name)).toEqual(["files", "Google Workspace"])
    const google = tiles.find((tile) => tile.id === "google-workspace")
    expect(google).toMatchObject({
      state: "needs_auth",
      tone: "yellow",
      configured: true,
      serverName: "google_workspace",
      services: ["Gmail", "Calendar", "Drive"],
    })
  })

  test("keeps the error text of a failed server", () => {
    const tiles = buildTiles({ db: { status: "failed", error: "spawn failed" } })
    expect(tiles.find((tile) => tile.serverName === "db")).toMatchObject({ state: "error", error: "spawn failed" })
  })

  test("sorts configured servers by name and puts available tiles last", () => {
    const tiles = buildTiles({ zeta: { status: "connected" }, alpha: { status: "disabled" } })
    expect(tiles.map((tile) => tile.name)).toEqual(["alpha", "zeta", "Google Workspace"])
  })

  test("counts and filters tiles", () => {
    const tiles = buildTiles({
      a: { status: "connected" },
      b: { status: "connected" },
      c: { status: "needs_auth" },
      d: { status: "failed", error: "x" },
      e: { status: "disabled" },
    })
    expect(filterCounts(tiles)).toEqual({ all: 6, connected: 2, needs_auth: 1, error: 1 })
    expect(filterTiles(tiles, "all", "")).toHaveLength(6)
    expect(filterTiles(tiles, "connected", "").map((tile) => tile.name)).toEqual(["a", "b"])
    expect(filterTiles(tiles, "needs_auth", "").map((tile) => tile.name)).toEqual(["c"])
    expect(filterTiles(tiles, "error", "").map((tile) => tile.name)).toEqual(["d"])
  })

  test("searches by name and service", () => {
    const tiles = buildTiles({ files: { status: "connected" } })
    expect(filterTiles(tiles, "all", "fil").map((tile) => tile.name)).toEqual(["files"])
    expect(filterTiles(tiles, "all", "gmail").map((tile) => tile.name)).toEqual(["Google Workspace"])
    expect(filterTiles(tiles, "all", "nothing")).toEqual([])
  })

  test("summarises the hub from configured servers only", () => {
    expect(hubSummary(buildTiles({}))).toEqual({ total: 1, configured: 0, connected: 0, tone: "grey" })
    expect(hubSummary(buildTiles({ a: { status: "connected" } }))).toEqual({ total: 2, configured: 1, connected: 1, tone: "green" })
    expect(hubSummary(buildTiles({ a: { status: "connected" }, b: { status: "needs_auth" } })).tone).toBe("yellow")
    expect(hubSummary(buildTiles({ a: { status: "connected" }, b: { status: "failed" } })).tone).toBe("red")
    expect(hubSummary(buildTiles({ a: { status: "disabled" } }))).toEqual({ total: 2, configured: 1, connected: 0, tone: "grey" })
  })
})

describe("connector kinds, hub status and tool counts", () => {
  test("marks memory, google and generic tiles", () => {
    const tiles = buildTiles({ memory: { status: "connected" }, files: { status: "connected" } })
    expect(tiles.find((tile) => tile.serverName === "memory")?.kind).toBe("memory")
    expect(tiles.find((tile) => tile.serverName === "files")?.kind).toBe("generic")
    expect(tiles.find((tile) => tile.id === "google-workspace")?.kind).toBe("google")
  })

  test("keeps the hub server out of the tiles and reports its status", () => {
    const mcp = { hub: { status: "connected" }, memory: { status: "connected" } }
    expect(buildTiles(mcp).map((tile) => tile.name)).toEqual(["memory", "Google Workspace"])
    expect(hubServer(mcp)).toEqual({ state: "connected", tone: "green" })
    expect(hubServer({ hub: { status: "failed" } })).toEqual({ state: "error", tone: "red" })
    expect(hubServer({ memory: { status: "connected" } })).toBeUndefined()
    expect(hubServer(undefined)).toBeUndefined()
  })

  test("counts the tools of each server by id prefix", () => {
    const ids = ["bash", "memory_add", "memory_search", "google_workspace_gmail_list", "memory-extra_x"]
    expect(countTools(ids, "memory")).toBe(2)
    expect(countTools(ids, "google_workspace")).toBe(1)
    expect(countTools(ids, "memory-extra")).toBe(1)
    expect(countTools(ids, "files")).toBe(0)
    expect(countTools(ids, "My Server.1")).toBe(0)
    expect(countTools(["My_Server_1_ping"], "My Server.1")).toBe(1)
  })
})

describe("hub summary plural", () => {
  test("has singular and plural English variants and no bare key", async () => {
    const { dict } = await import("../../i18n/en")
    expect(dict["hub.summary.one"]).toBe("{{count}} connector")
    expect(dict["hub.summary.other"]).toBe("{{count}} connectors")
    expect(Object.hasOwn(dict, "hub.summary")).toBe(false)
  })
})
