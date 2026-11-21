import type { Database } from "bun:sqlite"
import { createBoard } from "./board"
import { createMemory } from "./memory"

export interface StoreOptions {
  readonly expansionCap?: number
}

export const createStore = (db: Database, options: StoreOptions = {}) => ({
  ...createMemory(db, options.expansionCap),
  task: createBoard(db),
})

export type Store = ReturnType<typeof createStore>
