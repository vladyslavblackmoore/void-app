#!/usr/bin/env bun
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { Readable, Writable } from "node:stream"
import { ShimAgent } from "./agent"
import { parseShimArgs } from "./args"
import { createConfigStore } from "./mcp"

const options = parseShimArgs(process.argv.slice(2))
const store = createConfigStore()
let agent: ShimAgent | undefined

const stream = ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
)
const connection = new AgentSideConnection((conn) => {
  agent = new ShimAgent(conn, options, store)
  return agent
}, stream)

const shutdown = async () => {
  await agent?.close()
  process.exit(0)
}

connection.signal.addEventListener("abort", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
process.on("SIGINT", () => void shutdown())
