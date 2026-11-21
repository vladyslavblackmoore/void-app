import { tileState, tileTone, type McpStatusInput, type TileState, type TileTone } from "./connector-model"

export const MEMORY_CONNECTOR = "memory"

export type MemoryCard = { state: TileState; tone: TileTone; error?: string }

export function memoryCard(mcp: Record<string, McpStatusInput> | undefined): MemoryCard | undefined {
  const entry = mcp?.[MEMORY_CONNECTOR]
  if (!entry) return undefined
  const state = tileState(entry.status)
  const card: MemoryCard = { state, tone: tileTone(state) }
  if (state === "error" && entry.error) card.error = entry.error
  return card
}
