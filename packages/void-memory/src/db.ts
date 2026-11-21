import { Database } from "./sqlite"
import { migrations } from "./migrations"

export interface OpenResult {
  readonly db: Database
  readonly applied: readonly number[]
}

export const schemaVersion = (db: Database): number => {
  const row = db.query<{ value: string }, []>("select value from meta where key = 'schema_version'").get()
  return row ? Number(row.value) : 0
}

const migrate = (db: Database): number[] => {
  db.run("create table if not exists meta(key text primary key, value text not null)")
  const applied: number[] = []
  const run = db.transaction(() => {
    const current = schemaVersion(db)
    for (const migration of migrations) {
      if (migration.version <= current) continue
      for (const statement of migration.statements) db.run(statement)
      db.query("insert into meta(key, value) values('schema_version', ?1) on conflict(key) do update set value = excluded.value").run(
        String(migration.version),
      )
      applied.push(migration.version)
    }
  })
  run.immediate()
  return applied
}

export const openDatabase = (path: string): OpenResult => {
  const db = new Database(path, { timeout: 5000 })
  db.run("pragma busy_timeout = 5000")
  db.run("pragma journal_mode = WAL")
  db.run("pragma synchronous = NORMAL")
  db.run("pragma foreign_keys = ON")
  return { db, applied: migrate(db) }
}
