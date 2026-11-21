import type { Database } from "bun:sqlite"
import { createBoard } from "./board"
import { createMemory } from "./memory"

export interface StoreOptions {
  readonly expansionCap?: number
  readonly fanout?: number
}

export const createStore = (db: Database, options: StoreOptions = {}) => ({
  ...createMemory(db, options.expansionCap, options.fanout),
  task: createBoard(db),
})

export type Store = ReturnType<typeof createStore>
