import { spaceConnection, spaceKey, type SpaceSidecar } from "@opencode-ai/app/spaces/connection"
import { HOME_SPACE_ID, type SpacesPlatform } from "@opencode-ai/app/spaces/types"

export async function loadViewedSpace(spaces: SpacesPlatform) {
  try {
    const id = await spaces.getViewed()
    if (id === HOME_SPACE_ID) return
    const summary = (await spaces.list()).find((item) => item.id === id)
    if (!summary) return
    return spaceConnection(summary, await spaces.start(id))
  } catch {
    return
  }
}

export function startupServerKey(defaultServer: string | null | undefined, viewed: SpaceSidecar | undefined) {
  if (defaultServer) return defaultServer
  return spaceKey(viewed?.space)
}
