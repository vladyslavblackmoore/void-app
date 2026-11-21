import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"

const child = spawn("sleep", ["300"], { stdio: "ignore" })
writeFileSync(process.env["STUB_PIDS"] ?? "", `${process.pid} ${child.pid}`)
process.on("SIGTERM", () => {})
console.log("ready")
setInterval(() => {}, 1000)
