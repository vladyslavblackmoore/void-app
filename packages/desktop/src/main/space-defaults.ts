import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { seedAgents } from "./agents"
import { seedConfig } from "./config-seed"
import { seedMemory, seedMemoryPlugin, type MemoryRuntime } from "./memory-seed"
import { createSpace, ensureHomeSpace, isSpaceId, listSpaces, spaceDir, type Space } from "./spaces"

export type SpaceTemplate = Pick<Space, "class" | "sessionMode" | "color">
export type SpaceTemplates = { personal: SpaceTemplate; company: SpaceTemplate }
export type SpaceSeed = { agents: Array<{ name: string; content: string }>; wrapper: string; plugin?: string; config?: string; memory?: MemoryRuntime; memoryPlugin?: string }

const VOID_SPACE_ID = "void"
const WORK_SPACE_ID = "work"

async function oldCompanySpace(legacyRoot: string) {
  const entries = await readdir(legacyRoot, { withFileTypes: true }).catch(() => [])
  const found = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const text = await readFile(join(legacyRoot, entry.name, "space.json"), "utf8").catch(() => undefined)
        if (text === undefined) return
        try {
          const value = JSON.parse(text) as { id?: unknown; name?: unknown; class?: unknown }
          if (value.class !== "company" || !isSpaceId(value.id)) return
          if (typeof value.name !== "string" || value.name === "") return
          return { id: value.id, name: value.name }
        } catch {
          return
        }
      }),
  )
  return found.find((item) => item !== undefined)
}

async function createIfAbsent(root: string, existing: Set<string>, space: Space) {
  if (existing.has(space.id)) return
  await createSpace(root, space).catch(() => undefined)
}

export async function ensureDefaultSpaces(root: string, templates: SpaceTemplates, legacyRoot: string) {
  await ensureHomeSpace(root)
  const spaces = await listSpaces(root)
  const ids = new Set(spaces.map((space) => space.id))
  await createIfAbsent(root, ids, { id: VOID_SPACE_ID, name: "VOID", ...templates.personal })
  if (spaces.some((space) => space.class === "company")) return
  const work = (await oldCompanySpace(legacyRoot)) ?? { id: WORK_SPACE_ID, name: "Work" }
  if (work.id === "home" || work.id === VOID_SPACE_ID) return
  await createIfAbsent(root, ids, { ...work, ...templates.company })
}

export async function seedSpace(root: string, id: string, seed: SpaceSeed) {
  const dir = spaceDir(root, id)
  const configDir = join(dir, "config", "opencode")
  const stateDir = join(dir, "state")
  await seedAgents(configDir, stateDir, seed.agents)
  await seedConfig(configDir, stateDir, seed.wrapper, join(dir, "data", "opencode", "auth.json"), {
    plugin: seed.plugin,
    config: seed.config,
  })
  await seedMemory(dir, configDir, seed.memory)
  await seedMemoryPlugin(dir, configDir, seed.memoryPlugin)
}
