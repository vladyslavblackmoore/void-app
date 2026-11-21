import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { openDatabase } from "./db"
import { createServer } from "./server"
import { createStore } from "./store"

const path = process.env.VOID_MEMORY_DB
if (!path) {
  console.error("VOID_MEMORY_DB is not set")
  process.exit(1)
}

const { db } = openDatabase(path)
const server = createServer(createStore(db), { agent: process.env.VOID_MEMORY_AGENT })
await server.connect(new StdioServerTransport())
