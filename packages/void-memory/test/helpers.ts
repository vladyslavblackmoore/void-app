import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/db"
import { createStore } from "../src/store"

export const tempStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "void-memory-"))
  const path = join(dir, "graph.db")
  const { db } = openDatabase(path)
  const store = createStore(db)
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
