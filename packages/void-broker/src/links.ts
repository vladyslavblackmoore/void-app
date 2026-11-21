import type { McpServer } from "@agentclientprotocol/sdk"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AcpxWorkerLink } from "./acpx"
import { mapMcpServers } from "../../desktop/resources/provider/mcp-map.mjs"
import { readSpaceMcp } from "./space-mcp"
import type { WorkerLink } from "./types"
import type { WorkerEntry } from "./workers"

const defaultMemoryMain = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../void-memory/src/main.ts")

export type McpContext = { memoryDb: string; memoryMain: string; workerId: string; spaceMcp?: unknown }

const pairs = (values: Record<string, string> | undefined) =>
  Object.entries(values ?? {}).map(([name, value]) => ({ name, value }))

export function resolveMcp(names: string[], context: McpContext): McpServer[] {
  const space = mapMcpServers(context.spaceMcp)
  return names.map((name): McpServer => {
    if (name === "memory")
      return {
        name,
        command: process.execPath,
        args: [context.memoryMain],
        env: [
          { name: "VOID_MEMORY_DB", value: context.memoryDb },
          { name: "VOID_MEMORY_AGENT", value: context.workerId },
        ],
      }
    const server = space[name]
    if (!server) throw new Error(`unknown mcp server: ${name}`)
    if (server.type === "http") return { type: "http", name, url: server.url, headers: pairs(server.headers) }
    return { name, command: server.command, args: server.args, env: pairs(server.env) }
  })
}

export type LinkFactoryOptions = {
  stateDir: string
  cwd: string
  memoryDb: string
  memoryMain?: string
  spaceConfigDir?: string
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
        spaceMcp: readSpaceMcp(options.spaceConfigDir),
      }),
    })
  }
}
