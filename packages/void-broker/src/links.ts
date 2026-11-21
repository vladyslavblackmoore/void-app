import type { McpServer } from "@agentclientprotocol/sdk"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AcpxWorkerLink } from "./acpx"
import type { WorkerLink } from "./types"
import type { WorkerEntry } from "./workers"

const defaultMemoryMain = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../void-memory/src/main.ts")

export type McpContext = { memoryDb: string; memoryMain: string; workerId: string }

export function resolveMcp(names: string[], context: McpContext): McpServer[] {
  return names.map((name) => {
    if (name !== "memory") throw new Error(`unknown mcp server: ${name}`)
    return {
      name,
      command: process.execPath,
      args: [context.memoryMain],
      env: [
        { name: "VOID_MEMORY_DB", value: context.memoryDb },
        { name: "VOID_MEMORY_AGENT", value: context.workerId },
      ],
    }
  })
}

export type LinkFactoryOptions = {
  stateDir: string
  cwd: string
  memoryDb: string
  memoryMain?: string
  fallback: (entry: WorkerEntry) => WorkerLink
}

export function createLinkFactory(options: LinkFactoryOptions) {
  return (entry: WorkerEntry): WorkerLink => {
    if (entry.backend !== "anthropic-cli") return options.fallback(entry)
    return new AcpxWorkerLink({
      entry,
      stateDir: path.join(options.stateDir, "acpx"),
      cwd: entry.cwd ?? options.cwd,
      mcpServers: resolveMcp(entry.mcp, {
        memoryDb: options.memoryDb,
        memoryMain: options.memoryMain ?? defaultMemoryMain,
        workerId: entry.id,
      }),
    })
  }
}
