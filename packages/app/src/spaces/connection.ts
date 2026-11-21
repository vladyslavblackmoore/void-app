import type { ServerConnection } from "../context/server"
import { HOME_SPACE_ID, type SpaceEndpoint, type SpaceSummary } from "./types"

export type SpaceSidecar = Extract<ServerConnection.Sidecar, { variant: "base" }>

export function spaceKey(id: string | undefined) {
  return !id || id === HOME_SPACE_ID ? "sidecar" : `sidecar:${id}`
}

export function spaceConnection(
  space: Pick<SpaceSummary, "id" | "name">,
  endpoint: SpaceEndpoint,
): SpaceSidecar {
  return {
    type: "sidecar",
    variant: "base",
    space: space.id,
    displayName: space.name,
    http: { url: endpoint.url, username: endpoint.username, password: endpoint.password },
  }
}

export function endpointSignature(conn: { http: { url: string; username?: string; password?: string } }) {
  return [conn.http.url, conn.http.username ?? "", conn.http.password ?? ""].join("\u0000")
}
