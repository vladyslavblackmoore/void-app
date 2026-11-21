import { ServerConnection } from "../context/server"
import { spaceConnection, type SpaceSidecar } from "./connection"
import type { SpaceSummary, SpacesPlatform } from "./types"

export async function switchToSpace(input: {
  spaces: SpacesPlatform
  summary: Pick<SpaceSummary, "id" | "name">
  register: (conn: SpaceSidecar) => void
  activate: (key: ServerConnection.Key) => void
}) {
  const endpoint = await input.spaces.start(input.summary.id)
  const conn = spaceConnection(input.summary, endpoint)
  input.register(conn)
  input.activate(ServerConnection.key(conn))
  await input.spaces.setViewed(input.summary.id)
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
