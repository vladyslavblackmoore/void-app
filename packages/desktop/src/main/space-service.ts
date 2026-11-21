import { isCoreBusy, type CoreEndpoint, type Cores } from "./cores"
import { readViewedSpace, writeViewedSpace } from "./space-state"
import { HOME_SPACE_ID, isSpaceId, listSpaces, type Space } from "./spaces"

export type SpaceSummary = {
  id: string
  name: string
  color: string
  class: Space["class"]
  running: boolean
  busy: boolean
}

export type SpaceServiceDeps = {
  root: string
  cores: Cores
  fetch?: Parameters<typeof isCoreBusy>[1]
}

export function createSpaceService(deps: SpaceServiceDeps) {
  const known = async (id: string) => {
    if (!isSpaceId(id)) throw new Error("invalid space id")
    const spaces = await listSpaces(deps.root)
    if (!spaces.some((space) => space.id === id)) throw new Error("unknown space")
  }

  const list = async (): Promise<SpaceSummary[]> => {
    const spaces = await listSpaces(deps.root)
    return Promise.all(
      spaces.map(async (space) => {
        const endpoint = deps.cores.endpoint(space.id)
        return {
          id: space.id,
          name: space.name,
          color: space.color,
          class: space.class,
          running: endpoint !== undefined,
          busy: endpoint ? await isCoreBusy(endpoint, deps.fetch) : false,
        }
      }),
    )
  }

  const start = async (id: string): Promise<CoreEndpoint> => {
    await known(id)
    return deps.cores.ensure(id)
  }

  const getViewed = async () => {
    const saved = await readViewedSpace(deps.root)
    if (!saved) return HOME_SPACE_ID
    const spaces = await listSpaces(deps.root)
    return spaces.some((space) => space.id === saved) ? saved : HOME_SPACE_ID
  }

  const setViewed = async (id: string) => {
    await known(id)
    await writeViewedSpace(deps.root, id)
    deps.cores.setViewed(id)
  }

  return { list, start, getViewed, setViewed }
}

export type SpaceService = ReturnType<typeof createSpaceService>
