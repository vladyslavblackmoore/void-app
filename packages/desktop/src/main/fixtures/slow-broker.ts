import { mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import net from "node:net"

const socket = process.env["VOID_BROKER_SOCKET"] ?? ""
mkdirSync(dirname(socket), { recursive: true })
rmSync(socket, { force: true })
const server = net.createServer((client) => client.end("up\n"))
server.listen(socket, () => console.log("ready"))
process.stdin.on("end", () => {
  setTimeout(() => {
    rmSync(socket, { force: true })
    process.exit(0)
  }, 600)
})
process.stdin.resume()
