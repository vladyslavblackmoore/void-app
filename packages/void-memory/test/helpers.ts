import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/db"
import { createStore, type StoreOptions } from "../src/store"

export const tempStore = (options: StoreOptions = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "void-memory-"))
  const path = join(dir, "graph.db")
  const { db } = openDatabase(path)
  const store = createStore(db, options)
  return {
    path,
    db,
    store,
    close: () => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
