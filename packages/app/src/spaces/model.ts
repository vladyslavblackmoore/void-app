import { ServerConnection } from "../context/server"
import { spaceConnection, type SpaceSidecar } from "./connection"
import type { CoreStatus, SpaceSummary, SpacesPlatform } from "./types"

export async function switchToSpace(input: {
  spaces: SpacesPlatform
  summary: Pick<SpaceSummary, "id" | "name">
  register: (conn: SpaceSidecar) => void
  activate: (key: ServerConnection.Key) => void
}) {
  const endpoint = await input.spaces.setViewed(input.summary.id)
  const conn = spaceConnection(input.summary, endpoint)
  input.register(conn)
  input.activate(ServerConnection.key(conn))
}

export function menuSpaces(spaces: SpaceSummary[], viewed: string | undefined) {
  return spaces.map((space) => ({
    id: space.id,
    name: space.name,
    color: space.color,
    busy: space.busy,
    viewed: space.id === viewed,
  }))
}

export function applyCoreStatus(input: {
  status: CoreStatus
  viewed: string | undefined
  name: string
  register: (conn: SpaceSidecar) => void
  activate: (key: ServerConnection.Key) => void
}) {
  if (input.status.space !== input.viewed) return undefined
  if (input.status.state === "up" && input.status.endpoint) {
    const conn = spaceConnection({ id: input.status.space, name: input.name }, input.status.endpoint)
    input.register(conn)
    input.activate(ServerConnection.key(conn))
  }
  return input.status.state
}

export function visibleCoreState(
  current: { space: string; state: CoreStatus["state"] } | undefined,
  viewed: string | undefined,
) {
  return current && current.space === viewed ? current.state : undefined
}
