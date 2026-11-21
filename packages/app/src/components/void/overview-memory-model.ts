import { tileState, tileTone, type McpStatusInput, type TileState, type TileTone } from "./connector-model"

export const MEMORY_CONNECTOR = "memory"

export function memoryCard(mcp: Record<string, McpStatusInput> | undefined): { state: TileState; tone: TileTone } | undefined {
  const entry = mcp?.[MEMORY_CONNECTOR]
  if (!entry) return undefined
  const state = tileState(entry.status)
  return { state, tone: tileTone(state) }
}
