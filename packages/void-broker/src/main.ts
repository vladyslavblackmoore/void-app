import { runBroker } from "./run"

let closing = false
const server = await runBroker(process.env).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

const shutdown = () => {
  if (closing) return
  closing = true
  void server.close().finally(() => process.exit(0))
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
process.stdin.on("end", shutdown)
process.stdin.on("close", shutdown)
process.stdin.resume()
console.log("ready")
