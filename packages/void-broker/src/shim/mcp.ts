import { RequestError } from "@agentclientprotocol/sdk"
import type { McpServer } from "@agentclientprotocol/sdk"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

type ConfigEntry =
  | { type: "http"; url: string; headers: Record<string, string> }
  | { command: string; args: string[]; env: Record<string, string> }

const pairs = (items: { name: string; value: string }[]) => Object.fromEntries(items.map((item) => [item.name, item.value]))

export function mcpConfig(servers: McpServer[]) {
  const mcpServers: Record<string, ConfigEntry> = {}
  for (const server of servers) {
    if ("command" in server) {
      mcpServers[server.name] = { command: server.command, args: server.args, env: pairs(server.env) }
      continue
    }
    if (server.type !== "http") throw RequestError.invalidParams(undefined, `unsupported mcp server: ${server.name}`)
    mcpServers[server.name] = { type: "http", url: server.url, headers: pairs(server.headers) }
  }
  return { mcpServers }
}

export type ConfigStore = {
  write(servers: McpServer[]): Promise<string>
  dispose(): Promise<void>
}

export function createConfigStore(): ConfigStore {
  let dir: string | undefined
  return {
    async write(servers) {
      const config = mcpConfig(servers)
      dir ??= await mkdtemp(path.join(os.tmpdir(), "void-cli-acp-"))
      const file = path.join(dir, "mcp.json")
      await writeFile(file, JSON.stringify(config), { mode: 0o600 })
      return file
    },
    async dispose() {
      if (dir) await rm(dir, { recursive: true, force: true })
      dir = undefined
    },
  }
}
