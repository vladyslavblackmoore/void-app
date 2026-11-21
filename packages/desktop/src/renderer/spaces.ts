import { spaceConnection, spaceKey, type SpaceSidecar } from "@opencode-ai/app/spaces/connection"
import { HOME_SPACE_ID, type SpacesPlatform } from "@opencode-ai/app/spaces/types"

export async function loadViewedSpace(spaces: SpacesPlatform) {
  try {
    const id = await spaces.getViewed()
    const summary = id === HOME_SPACE_ID ? undefined : (await spaces.list()).find((item) => item.id === id)
    const endpoint = await spaces.setViewed(summary ? id : HOME_SPACE_ID)
    return summary ? spaceConnection(summary, endpoint) : undefined
  } catch {
    await spaces.setViewed(HOME_SPACE_ID).catch(() => undefined)
    return
  }
}

export function startupServerKey(defaultServer: string | null | undefined, viewed: SpaceSidecar | undefined) {
  if (defaultServer) return defaultServer
  return spaceKey(viewed?.space)
}
