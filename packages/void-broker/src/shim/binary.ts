import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { parseEvent, type BinaryEvent } from "./events"

export type BinaryProcess = {
  write(value: object): void
  end(): void
  exited: Promise<void>
  signal(name: NodeJS.Signals): void
  kill(): void
}

export type BinaryHandlers = {
  onEvent(event: BinaryEvent): void
  onExit(detail: string): void
}

export type BinarySpawn = {
  binary: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export function spawnBinary(options: BinarySpawn, handlers: BinaryHandlers): Promise<BinaryProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.binary, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "inherit"],
    })
    let alive = false
    let markExited: () => void = () => undefined
    const exited = new Promise<void>((done) => {
      markExited = done
    })
    child.once("error", (error) => {
      if (alive) handlers.onExit(error.message)
      else reject(error)
    })
    child.once("spawn", () => {
      alive = true
      resolve({
        write: (value) => {
          child.stdin.write(JSON.stringify(value) + "\n")
        },
        end: () => {
          child.stdin.end()
        },
        exited,
        signal: (name) => {
          child.kill(name)
        },
        kill: () => {
          child.kill("SIGKILL")
        },
      })
    })
    child.stdin.on("error", () => undefined)
    child.once("close", (code, signal) => {
      markExited()
      handlers.onExit(`binary exited (code ${code}, signal ${signal})`)
    })
    createInterface({ input: child.stdout }).on("line", (line) => {
      const event = parseEvent(line)
      if (event) handlers.onEvent(event)
    })
  })
}
