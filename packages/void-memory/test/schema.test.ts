import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase, schemaVersion } from "../src/db"
import { migrations } from "../src/migrations"

let dir = ""

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "void-memory-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const names = (db: ReturnType<typeof openDatabase>["db"]) =>
  db.query<{ name: string }, []>("select name from sqlite_master where name not like 'sqlite_%'").all().map((r) => r.name)

test("a fresh file gets all tables and the schema version", () => {
  const { db, applied } = openDatabase(join(dir, "graph.db"))
  const all = names(db)
  for (const table of ["node", "edge", "node_fts", "task_event", "meta"]) expect(all).toContain(table)
  expect(schemaVersion(db)).toBe(migrations.at(-1)!.version)
  expect(applied).toEqual(migrations.map((m) => m.version))
  db.close()
})

test("a second open does not migrate again", () => {
  const path = join(dir, "graph.db")
  openDatabase(path).db.close()
  const second = openDatabase(path)
  expect(second.applied).toEqual([])
  expect(schemaVersion(second.db)).toBe(migrations.at(-1)!.version)
  second.db.close()
})

test("pragmas are applied", () => {
  const { db } = openDatabase(join(dir, "graph.db"))
  expect(db.query<{ journal_mode: string }, []>("pragma journal_mode").get()?.journal_mode).toBe("wal")
  expect(db.query<{ timeout: number }, []>("pragma busy_timeout").get()?.timeout).toBe(5000)
  db.close()
})
