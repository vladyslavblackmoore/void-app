import { afterEach, expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { connect, tempDir } from "./helpers"

const main = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/main.ts")
const children: ChildProcess[] = []

afterEach(() => {
  while (children.length) children.pop()?.kill("SIGKILL")
})

async function layout(workers: unknown = { workers: [] }) {
  const root = await tempDir()
  const config = path.join(root, "config", "broker", "workers.json")
  await mkdir(path.dirname(config), { recursive: true })
  await writeFile(config, JSON.stringify(workers))
  const stateDir = path.join(root, "state", "broker")
  return {
    root,
    stateDir,
    socket: path.join(stateDir, "broker.sock"),
    env: {
      ...process.env,
      VOID_BROKER_CONFIG: config,
      VOID_BROKER_STATE_DIR: stateDir,
      VOID_BROKER_MEMORY_DB: path.join(root, "data", "memory", "graph.db"),
      VOID_BROKER_CWD: root,
    },
  }
}

function launch(env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, [main], { env, stdio: ["pipe", "pipe", "pipe"] })
  children.push(child)
  let out = ""
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()))
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      if (out.includes("ready")) {
        clearInterval(timer)
        resolve()
      }
    }, 20)
    child.once("exit", (code) => {
      clearInterval(timer)
      reject(new Error(`exited ${code}`))
    })
  })
  ready.catch(() => undefined)
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)))
  return { child, ready, exited }
}

test("serves the socket from the environment and exits when stdin closes", async () => {
  const { env, socket } = await layout({ workers: [{ id: "w", backend: "anthropic-cli" }] })
  const run = launch(env)
  await run.ready
  expect((await stat(socket)).mode & 0o777).toBe(0o600)
  const client = await connect(socket)
  client.send({ jsonrpc: "2.0", id: 1, method: "broker.health" })
  const health = await client.next((message) => message.id === 1)
  expect(health.result).toMatchObject({ ok: true, workers: 1 })
  client.close()
  run.child.stdin?.end()
  expect(await run.exited).toBe(0)
  expect(existsSync(socket)).toBe(false)
})

test("listens on VOID_BROKER_SOCKET when it is set", async () => {
  const { env, root, socket } = await layout()
  const custom = path.join(root, "custom.sock")
  const run = launch({ ...env, VOID_BROKER_SOCKET: custom })
  await run.ready
  expect(existsSync(custom)).toBe(true)
  expect(existsSync(socket)).toBe(false)
  run.child.stdin?.end()
  expect(await run.exited).toBe(0)
  expect(existsSync(custom)).toBe(false)
})

test("exits on SIGTERM and removes the socket", async () => {
  const { env, socket } = await layout()
  const run = launch(env)
  await run.ready
  run.child.kill("SIGTERM")
  expect(await run.exited).toBe(0)
  expect(existsSync(socket)).toBe(false)
})

test("fails with a message when the workers file is missing", async () => {
  const { env } = await layout()
  const run = launch({ ...env, VOID_BROKER_CONFIG: path.join(env.VOID_BROKER_STATE_DIR, "none.json") })
  expect(await run.exited).not.toBe(0)
})

test("a worker of an unsupported backend fails its run with an error", async () => {
  const { env, socket } = await layout({ workers: [{ id: "c", backend: "codex" }] })
  const run = launch(env)
  await run.ready
  const client = await connect(socket)
  client.send({ jsonrpc: "2.0", id: 1, method: "delegate.start", params: { worker: "c", prompt: "x" } })
  const result = await client.next((message) => message.method === "delegate.result")
  expect(result.params).toMatchObject({ stopReason: "error" })
  client.close()
  run.child.stdin?.end()
  await run.exited
})
