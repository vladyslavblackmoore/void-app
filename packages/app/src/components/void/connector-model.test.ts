import { describe, expect, test } from "bun:test"
import {
  buildTiles,
  connectorCatalog,
  filterCounts,
  filterTiles,
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
})
