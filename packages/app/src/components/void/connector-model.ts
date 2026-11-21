export type McpStatusInput = { status: string; error?: string }

export type TileState = "connected" | "needs_auth" | "error" | "disabled" | "available"

export type TileTone = "green" | "yellow" | "red" | "grey"

export type TileAction = "manage" | "connect" | "reconnect" | "enable" | "setup"

export type ConnectorFilter = "all" | "connected" | "needs_auth" | "error"

export type CatalogEntry = {
  id: string
  name: string
  services: string[]
  match: string
}

export type ConnectorTile = {
  id: string
  name: string
  services: string[]
  state: TileState
  tone: TileTone
  action: TileAction
  configured: boolean
  serverName: string | undefined
  error: string | undefined
}

export const connectorFilters: ConnectorFilter[] = ["all", "connected", "needs_auth", "error"]

export const connectorCatalog: CatalogEntry[] = [
  { id: "google-workspace", name: "Google Workspace", services: ["Gmail", "Calendar", "Drive"], match: "google" },
]

export function tileState(status: string | undefined): TileState {
  if (status === "connected") return "connected"
  if (status === "needs_auth" || status === "needs_client_registration") return "needs_auth"
  if (status === "failed") return "error"
  return "disabled"
}

export function tileTone(state: TileState): TileTone {
  if (state === "connected") return "green"
  if (state === "needs_auth") return "yellow"
  if (state === "error") return "red"
  return "grey"
}

export function tileAction(state: TileState): TileAction {
  if (state === "connected") return "manage"
  if (state === "needs_auth") return "connect"
  if (state === "error") return "reconnect"
  if (state === "disabled") return "enable"
  return "setup"
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

function make(input: {
  id: string
  name: string
  services: string[]
  state: TileState
  serverName?: string
  error?: string
}): ConnectorTile {
  return {
    id: input.id,
    name: input.name,
    services: input.services,
    state: input.state,
    tone: tileTone(input.state),
    action: tileAction(input.state),
    configured: input.state !== "available",
    serverName: input.serverName,
    error: input.error,
  }
}

export function buildTiles(mcp: Record<string, McpStatusInput> | undefined): ConnectorTile[] {
  const names = Object.keys(mcp ?? {}).sort((a, b) => a.localeCompare(b))
  const claimed = new Map<string, string>()
  for (const entry of connectorCatalog) {
    const hit = names.find((name) => !claimed.has(name) && normalize(name).includes(entry.match))
    if (hit) claimed.set(hit, entry.id)
  }
  const configured = names
    .filter((name) => !claimed.has(name))
    .map((name) =>
      make({
        id: `mcp:${name}`,
        name,
        services: [],
        state: tileState(mcp?.[name]?.status),
        serverName: name,
        error: mcp?.[name]?.error,
      }),
    )
  const catalog = connectorCatalog.map((entry) => {
    const serverName = [...claimed.entries()].find(([, id]) => id === entry.id)?.[0]
    if (!serverName) return make({ id: entry.id, name: entry.name, services: entry.services, state: "available" })
    return make({
      id: entry.id,
      name: entry.name,
      services: entry.services,
      state: tileState(mcp?.[serverName]?.status),
      serverName,
      error: mcp?.[serverName]?.error,
    })
  })
  return [...configured, ...catalog]
}

export function filterCounts(tiles: ConnectorTile[]): Record<ConnectorFilter, number> {
  return {
    all: tiles.length,
    connected: tiles.filter((tile) => tile.state === "connected").length,
    needs_auth: tiles.filter((tile) => tile.state === "needs_auth").length,
    error: tiles.filter((tile) => tile.state === "error").length,
  }
}

export function filterTiles(tiles: ConnectorTile[], filter: ConnectorFilter, query: string): ConnectorTile[] {
  const needle = query.trim().toLowerCase()
  return tiles
    .filter((tile) => filter === "all" || tile.state === filter)
    .filter(
      (tile) =>
        needle === "" ||
        tile.name.toLowerCase().includes(needle) ||
        tile.services.some((service) => service.toLowerCase().includes(needle)),
    )
}
