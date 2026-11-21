import type { PluginModule } from "@opencode-ai/plugin"
import { recallBlockFromFile } from "./recall"

export const recallCap = 1500

export const compactionInstruction = [
  "Before this conversation is compacted, save every durable fact, decision and open task that is not yet stored.",
  "Call memory_remember for facts and decisions, task_update or task_result for board items, and pin what must stay in view with props.pinned = true.",
  "Do not store chat history or temporary details.",
].join(" ")

export const memoryPlugin = (databasePath: string): PluginModule => ({
  id: "void.memory",
  server: async () => ({
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        const block = recallBlockFromFile(databasePath, { cap: recallCap })
        if (block !== undefined) output.system.push(block)
      } catch {
        return
      }
    },
    "experimental.session.compacting": async (_input, output) => {
      output.context.push(compactionInstruction)
    },
  }),
})
