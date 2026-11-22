import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureHomeDir, legacyHomeDirs, migrateHomeProjectState, migrateHomeSessions } from "./home-dir"
import { voidHomeDir } from "./void-home"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "void-home-dir-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function seedDb(file: string, rows: { id: string; project: string; directory: string; path: string }[]) {
  const db = new DatabaseSync(file)
  db.exec(
    "CREATE TABLE session (id text PRIMARY KEY, project_id text NOT NULL, directory text NOT NULL, path text, title text, time_updated integer NOT NULL)",
  )
  const insert = db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)")
  for (const row of rows) insert.run(row.id, row.project, row.directory, row.path, row.id, 5)
  db.close()
}

function readSessions(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  const rows = db.prepare("SELECT id, project_id, directory, path, time_updated FROM session ORDER BY id").all()
  db.close()
  return rows as { id: string; project_id: string; directory: string; path: string | null; time_updated: number }[]
}

describe("home dir", () => {
  test("lives under the void root, outside the user's home folder contents", () => {
    expect(voidHomeDir("/r")).toBe(join("/r", "home"))
  })

  test("lists the folders that used to host the home project", () => {
    expect(legacyHomeDirs("/Users/u", "/Users/u/Documents")).toEqual(["/Users/u", "/Users/u/Documents/Default Project"])
  })

  test("creates the directory and makes it a git root so instruction lookup stops there", async () => {
    mkdirSync(join(root, "outer", ".git"), { recursive: true })
    writeFileSync(join(root, "outer", "AGENTS.md"), "leak")
    const home = join(root, "outer", "void", "home")
    await ensureHomeDir(home)
    expect(existsSync(join(home, ".git"))).toBe(true)
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: home, encoding: "utf8" }).trim()
    expect(realpathSync(top)).toBe(realpathSync(home))
  })

  test("does not initialise twice", async () => {
    const calls: string[] = []
    const home = join(root, "home")
    await ensureHomeDir(home, async (dir) => {
      calls.push(dir)
      mkdirSync(join(dir, ".git"))
    })
    await ensureHomeDir(home, async (dir) => {
      calls.push(dir)
    })
    expect(calls).toEqual([home])
  })

  test("moves the legacy sessions to the home dir and backs the database up first", () => {
    const data = join(root, "data")
    mkdirSync(data)
    const legacy = ["/u", "/u/Documents/Default Project"]
    const target = join(root, "home")
    const db = join(data, "opencode.db")
    seedDb(db, [
      { id: "a", project: "global", directory: "/u/Documents/Default Project", path: "u/Documents/Default Project" },
      { id: "b", project: "global", directory: "/u", path: "u" },
      { id: "c", project: "global", directory: "/other", path: "other" },
      { id: "d", project: "abc", directory: "/u", path: "" },
    ])
    const result = migrateHomeSessions({ dbDir: data, target, legacy })
    expect(result.moved).toBe(2)
    expect(readSessions(db)).toEqual([
      { id: "a", project_id: "global", directory: target, path: "", time_updated: 5 },
      { id: "b", project_id: "global", directory: target, path: "", time_updated: 5 },
      { id: "c", project_id: "global", directory: "/other", path: "other", time_updated: 5 },
      { id: "d", project_id: "abc", directory: "/u", path: "", time_updated: 5 },
    ])
    const backups = readdirSync(data).filter((name) => name.includes(".pre-home-dir-"))
    expect(backups).toHaveLength(1)
    expect(readSessions(join(data, backups[0])).map((row) => row.directory)).toEqual([
      "/u/Documents/Default Project",
      "/u",
      "/other",
      "/u",
    ])
  })

  test("is idempotent and leaves no extra backup", () => {
    const data = join(root, "data")
    mkdirSync(data)
    const target = join(root, "home")
    seedDb(join(data, "opencode.db"), [{ id: "a", project: "global", directory: "/u", path: "u" }])
    expect(migrateHomeSessions({ dbDir: data, target, legacy: ["/u"] }).moved).toBe(1)
    expect(migrateHomeSessions({ dbDir: data, target, legacy: ["/u"] }).moved).toBe(0)
    expect(readdirSync(data).filter((name) => name.includes(".pre-home-dir-"))).toHaveLength(1)
  })

  test("skips databases without sessions, missing folders and backups", () => {
    const data = join(root, "data")
    mkdirSync(data)
    const empty = new DatabaseSync(join(data, "opencode-next.db"))
    empty.exec("CREATE TABLE other (a text)")
    empty.close()
    writeFileSync(join(data, "opencode.db.pre-home-dir-1"), "not a database")
    expect(migrateHomeSessions({ dbDir: data, target: join(root, "home"), legacy: ["/u"] }).moved).toBe(0)
    expect(migrateHomeSessions({ dbDir: join(root, "missing"), target: "/t", legacy: ["/u"] }).moved).toBe(0)
  })

  test("rewrites the remembered home project in the renderer state", () => {
    const file = join(root, "opencode.global.dat")
    const server = {
      list: [],
      projects: {
        local: [
          { worktree: "/u/Documents/Default Project", expanded: true },
          { worktree: "/work/app", expanded: false },
        ],
      },
      lastProject: { local: "/u/Documents/Default Project" },
      recentlyClosed: {},
    }
    writeFileSync(file, JSON.stringify({ server: JSON.stringify(server), layout: "{}" }, null, "\t"))
    expect(migrateHomeProjectState(file, "/t/home", ["/u", "/u/Documents/Default Project"])).toBe(true)
    const saved = JSON.parse(readFileSync(file, "utf8"))
    expect(saved.layout).toBe("{}")
    const next = JSON.parse(saved.server)
    expect(next.projects.local).toEqual([
      { worktree: "/t/home", expanded: true },
      { worktree: "/work/app", expanded: false },
    ])
    expect(next.lastProject.local).toBe("/t/home")
    expect(migrateHomeProjectState(file, "/t/home", ["/u", "/u/Documents/Default Project"])).toBe(false)
  })

  test("does not duplicate the home project when both are remembered", () => {
    const file = join(root, "opencode.global.dat")
    const server = { projects: { local: [{ worktree: "/t/home" }, { worktree: "/u" }] } }
    writeFileSync(file, JSON.stringify({ server: JSON.stringify(server) }))
    migrateHomeProjectState(file, "/t/home", ["/u"])
    expect(JSON.parse(JSON.parse(readFileSync(file, "utf8")).server).projects.local).toEqual([{ worktree: "/t/home" }])
  })

  test("ignores a missing or malformed state file", () => {
    expect(migrateHomeProjectState(join(root, "none"), "/t", ["/u"])).toBe(false)
    const bad = join(root, "bad")
    writeFileSync(bad, "{")
    expect(migrateHomeProjectState(bad, "/t", ["/u"])).toBe(false)
    expect(readFileSync(bad, "utf8")).toBe("{")
  })
})
