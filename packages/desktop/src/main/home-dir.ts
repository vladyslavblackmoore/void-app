import { execFile } from "node:child_process"
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

const DB_FILE = /^opencode(-[A-Za-z0-9._-]+)?\.db$/
const DEFAULT_PROJECT_DIR = "Default Project"

export function legacyHomeDirs(home: string, documents: string) {
  return [home, join(documents, DEFAULT_PROJECT_DIR)]
}

async function gitInit(dir: string) {
  await run("git", ["init", "--quiet", dir])
}

export async function ensureHomeDir(dir: string, init: (dir: string) => Promise<void> = gitInit) {
  await mkdir(dir, { recursive: true })
  if (existsSync(join(dir, ".git"))) return
  await init(dir)
}

function backupName(file: string) {
  return `${file}.pre-home-dir-${Date.now()}`
}

export function migrateHomeSessions(input: { dbDir: string; target: string; legacy: string[] }) {
  const databases = existsSync(input.dbDir)
    ? readdirSync(input.dbDir)
        .filter((name) => DB_FILE.test(name))
        .map((name) => join(input.dbDir, name))
    : []
  const backups: string[] = []
  let moved = 0
  const marks = input.legacy.map(() => "?").join(", ")
  for (const file of databases) {
    let db: DatabaseSync | undefined
    try {
      db = new DatabaseSync(file)
      db.exec("PRAGMA busy_timeout = 5000")
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'").get()
      if (!table) continue
      const count = db
        .prepare(`SELECT count(*) AS n FROM session WHERE project_id = 'global' AND directory IN (${marks})`)
        .get(...input.legacy) as { n: number }
      if (count.n === 0) continue
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
      const backup = backupName(file)
      copyFileSync(file, backup)
      backups.push(backup)
      const result = db
        .prepare(
          `UPDATE session SET directory = ?, path = '' WHERE project_id = 'global' AND directory IN (${marks})`,
        )
        .run(input.target, ...input.legacy)
      moved += Number(result.changes)
    } catch {
      continue
    } finally {
      db?.close()
    }
  }
  return { moved, backups }
}

function remap(value: unknown, target: string, legacy: string[]) {
  return typeof value === "string" && legacy.includes(value) ? target : value
}

export function migrateHomeProjectState(file: string, target: string, legacy: string[]) {
  if (!existsSync(file)) return false
  let outer: Record<string, unknown>
  let server: { projects?: Record<string, unknown>; lastProject?: Record<string, unknown> }
  try {
    outer = JSON.parse(readFileSync(file, "utf8"))
    server = JSON.parse(String(outer.server))
  } catch {
    return false
  }
  if (!server || typeof server !== "object") return false
  let changed = false

  for (const [scope, list] of Object.entries(server.projects ?? {})) {
    if (!Array.isArray(list)) continue
    const seen = new Set<string>()
    const next: unknown[] = []
    for (const item of list) {
      const worktree = (item as { worktree?: unknown } | null)?.worktree
      const mapped = remap(worktree, target, legacy)
      if (mapped !== worktree) changed = true
      if (typeof mapped === "string") {
        if (seen.has(mapped)) {
          changed = true
          continue
        }
        seen.add(mapped)
      }
      next.push(mapped === worktree ? item : { ...(item as object), worktree: mapped })
    }
    if (server.projects) server.projects[scope] = next
  }

  for (const [scope, value] of Object.entries(server.lastProject ?? {})) {
    const mapped = remap(value, target, legacy)
    if (mapped === value) continue
    changed = true
    if (server.lastProject) server.lastProject[scope] = mapped
  }

  if (!changed) return false
  outer.server = JSON.stringify(server)
  const temp = `${file}.home-dir.tmp`
  writeFileSync(temp, JSON.stringify(outer, null, "\t"))
  renameSync(temp, file)
  return true
}
