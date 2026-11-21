import { constants } from "node:fs"
import { chmod, cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const LEGACY_CLI_DIR = "claude"
export const HOME_SPACE_ID = "home"
export const SPACE_DIRS = ["data", "config", "state", "cli"] as const

const SPACE_FILE = "space.json"
const RESERVED_IDS = new Set(["machine"])
const SIGNING_DIR = "signing"
const BACKUP_SUFFIX = "pre-spaces"

export type SpaceClass = "personal" | "company"
export type SessionMode = "isolated" | "user"

export type Space = {
  id: string
  name: string
  class: SpaceClass
  sessionMode: SessionMode
  color: string
  roots?: string[]
}

export type CreateSpaceHooks = {
  finalize?: (dir: string) => void | Promise<void>
}

export function isSpaceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value) && !RESERVED_IDS.has(value)
}

export function spacesDir(root: string) {
  return join(root, "spaces")
}

export function spaceDir(root: string, id: string) {
  return join(spacesDir(root), id)
}

function parseSpace(value: unknown, expectedId?: string): Space | undefined {
  if (!value || typeof value !== "object") return
  const item = value as Record<string, unknown>
  if (!isSpaceId(item.id) || (expectedId !== undefined && item.id !== expectedId)) return
  if (typeof item.name !== "string" || item.name === "") return
  if (item.class !== "personal" && item.class !== "company") return
  if (item.sessionMode !== "isolated" && item.sessionMode !== "user") return
  if (typeof item.color !== "string" || item.color === "") return
  if (item.roots !== undefined && (!Array.isArray(item.roots) || item.roots.some((root) => typeof root !== "string")))
    return
  return {
    id: item.id,
    name: item.name,
    class: item.class,
    sessionMode: item.sessionMode,
    color: item.color,
    ...(item.roots === undefined ? {} : { roots: item.roots as string[] }),
  }
}

export async function listSpaces(root: string): Promise<Space[]> {
  const entries = await readdir(spacesDir(root), { withFileTypes: true }).catch(() => [])
  const spaces = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const text = await readFile(join(spaceDir(root, entry.name), SPACE_FILE), "utf8").catch(() => undefined)
        if (text === undefined) return
        try {
          return parseSpace(JSON.parse(text), entry.name)
        } catch {
          return
        }
      }),
  )
  return spaces.filter((space): space is Space => space !== undefined).sort((a, b) => a.id.localeCompare(b.id))
}

async function privateDir(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  await chmod(path, 0o700)
}

async function writeSpaceFile(dir: string, space: Space) {
  const temp = join(dir, `${SPACE_FILE}.${process.pid}.tmp`)
  await writeFile(temp, JSON.stringify(space, null, 2) + "\n", { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, join(dir, SPACE_FILE))
}

export async function createSpace(root: string, input: Space, hooks: CreateSpaceHooks = {}): Promise<Space> {
  const space = parseSpace(input)
  if (!space) throw new Error("invalid space")
  const dir = spaceDir(root, space.id)
  if (await stat(dir).then(() => true, () => false)) throw new Error("space exists")
  await privateDir(spacesDir(root))
  await mkdir(dir, { mode: 0o700 })
  try {
    await chmod(dir, 0o700)
    await Promise.all(SPACE_DIRS.map((name) => privateDir(join(dir, name))))
    await hooks.finalize?.(dir)
    await writeSpaceFile(dir, space)
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return space
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function rewriteMovedPaths(text: string, root: string, home: string) {
  const boundary = "(?![A-Za-z0-9._-])"
  const moves: [string, string, string][] = [
    [join(root, LEGACY_CLI_DIR), join(home, "cli"), ""],
    [join(root, "config"), join(home, "config"), ""],
    [join(root, "data"), join(home, "data"), ""],
    [join(root, "state"), join(home, "state"), `(?!/${SIGNING_DIR}${boundary})`],
  ]
  return moves.reduce(
    (result, [from, to, extra]) =>
      result.replace(new RegExp(escapeRegExp(from) + boundary + extra, "g"), () => to),
    text,
  )
}

export type HomeMigrationOptions = {
  log?: (message: string, meta?: Record<string, unknown>) => void
  beforeMove?: (path: string) => void | Promise<void>
}

type MigrationPlan = { sources: { from: string; to: string; backup: string }[] }

const MIGRATION_MARKER = ".migrating"

async function exists(path: string) {
  return stat(path).then(() => true, () => false)
}

async function freeBackupPath(root: string, name: string, suffix: string, taken: Set<string>) {
  for (let index = 1; ; index++) {
    const candidate = join(root, index === 1 ? `${name}.${suffix}` : `${name}.${suffix}-${index}`)
    if (!taken.has(candidate) && !(await exists(candidate))) return candidate
  }
}

async function restrictModes(path: string) {
  const info = await lstat(path)
  if (info.isSymbolicLink()) return
  if (info.isDirectory()) {
    await chmod(path, 0o700)
    const entries = await readdir(path)
    await Promise.all(entries.map((entry) => restrictModes(join(path, entry))))
    return
  }
  await chmod(path, info.mode & 0o700)
}

async function writeMarker(home: string, plan: MigrationPlan) {
  const temp = join(home, `${MIGRATION_MARKER}.tmp`)
  await writeFile(temp, JSON.stringify(plan), { mode: 0o600 })
  await rename(temp, join(home, MIGRATION_MARKER))
}

async function readMarker(home: string): Promise<MigrationPlan | undefined> {
  const text = await readFile(join(home, MIGRATION_MARKER), "utf8").catch(() => undefined)
  if (text === undefined) return
  try {
    const value = JSON.parse(text) as MigrationPlan
    return Array.isArray(value.sources) ? value : undefined
  } catch {
    return
  }
}

async function planMigration(root: string, now: Date): Promise<MigrationPlan> {
  const names: [string, string][] = [
    ["data", "data"],
    ["config", "config"],
    ["state", "state"],
    [LEGACY_CLI_DIR, "cli"],
  ]
  const suffix = `${BACKUP_SUFFIX}-${now.toISOString().slice(0, 10)}`
  const taken = new Set<string>()
  const sources: MigrationPlan["sources"] = []
  for (const [from, to] of names) {
    const path = join(root, from)
    const info = await lstat(path).catch(() => undefined)
    if (!info) continue
    if (info.isSymbolicLink()) throw new Error(`migration source is a symlink: ${path}`)
    const backup = await freeBackupPath(root, from, suffix, taken)
    taken.add(backup)
    sources.push({ from, to, backup })
  }
  return { sources }
}

async function copyInto(root: string, target: string, from: string, backup: string) {
  const signing = join(root, "state", SIGNING_DIR)
  const filter = (path: string) => path !== signing
  const options = { recursive: true, filter, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE }
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  if (from === "state") {
    if (await exists(backup)) await cp(backup, target, options)
    if (await exists(join(root, from))) await cp(join(root, from), target, options)
    return
  }
  const source = (await exists(join(root, from))) ? join(root, from) : backup
  await cp(source, target, options)
}

async function backUp(root: string, source: MigrationPlan["sources"][number], options: HomeMigrationOptions) {
  const original = join(root, source.from)
  if (!(await exists(original))) return
  if (source.from !== "state") {
    await options.beforeMove?.(original)
    await rename(original, source.backup)
    return
  }
  await mkdir(source.backup, { recursive: true })
  const entries = (await readdir(original)).filter((entry) => entry !== SIGNING_DIR)
  for (const entry of entries) {
    await options.beforeMove?.(join(original, entry))
    await rename(join(original, entry), join(source.backup, entry))
  }
}

export async function ensureHomeSpace(root: string, now = new Date(), options: HomeMigrationOptions = {}) {
  const home = spaceDir(root, HOME_SPACE_ID)
  if (await exists(join(home, SPACE_FILE))) {
    await rm(join(home, MIGRATION_MARKER), { force: true })
    return
  }
  await privateDir(spacesDir(root))
  const resumed = await readMarker(home)
  const plan = resumed ?? (await planMigration(root, now))
  await privateDir(home)
  await Promise.all(SPACE_DIRS.map((name) => privateDir(join(home, name))))
  if (plan.sources.length > 0) options.log?.("home space migration started", { resumed: Boolean(resumed) })
  if (!resumed) await writeMarker(home, plan)

  await Promise.all(
    plan.sources.map(async (source) => {
      const target = join(home, source.to)
      await copyInto(root, target, source.from, source.backup)
      await restrictModes(target)
    }),
  )

  const config = join(home, "config", "opencode", "opencode.jsonc")
  const text = await readFile(config, "utf8").catch(() => undefined)
  if (text !== undefined) {
    const next = rewriteMovedPaths(text, root, home)
    if (next !== text) await writeFile(config, next)
  }

  for (const source of plan.sources) await backUp(root, source, options)

  await writeSpaceFile(home, {
    id: HOME_SPACE_ID,
    name: "Home",
    class: "personal",
    sessionMode: "isolated",
    color: "#4f8cff",
  })
  await rm(join(home, MIGRATION_MARKER), { force: true })
  if (plan.sources.length > 0) options.log?.("home space migration finished")
}
