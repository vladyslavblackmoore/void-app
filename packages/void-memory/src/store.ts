import type { Database } from "bun:sqlite"
import { createMemory } from "./memory"

export const createStore = (db: Database) => ({
  ...createMemory(db),
})

export type Store = ReturnType<typeof createStore>
