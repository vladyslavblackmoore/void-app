import { afterEach, describe, expect, test } from "bun:test"
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk"
import type { SessionNotification } from "@agentclientprotocol/sdk"
import { spawn, type ChildProcess } from "node:child_process"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { Readable, Writable } from "node:stream"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { tempDir, text } from "./helpers"

const here = path.dirname(fileURLToPath(import.meta.url))
const main = path.join(here, "../src/shim/main.ts")
const stub = path.join(here, "stub-binary.ts")

const start = z.object({
  type: z.literal("start"),
  argv: z.array(z.string()),
  configDir: z.string().nullable(),
  cwd: z.string(),
})
const entry = z.union([start, z.object({ type: z.literal("stdin"), line: z.string() })])

type Harness = {
  connection: ClientSideConnection
  updates: SessionNotification[]
  record: string
  dir: string
  child: ChildProcess
}

const open: ChildProcess[] = []

async function launch(env: Record<string, string>, extra: string[] = []): Promise<Harness> {
  const dir = await tempDir()
  const record = path.join(dir, "record.jsonl")
  const child = spawn(
    process.execPath,
    [
      main,
      "--binary",
      stub,
      "--model",
      "opus-test",
      "--effort",
      "low",
      "--permission-mode",
      "dontAsk",
      "--config-dir",
      path.join(dir, "account"),
      ...extra,
    ],
    { env: { ...process.env, STUB_RECORD: record, ...env }, stdio: ["pipe", "pipe", "inherit"] },
  )
  open.push(child)
  const updates: SessionNotification[] = []
  if (!child.stdin || !child.stdout) throw new Error("shim stdio missing")
  const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>)
  const connection = new ClientSideConnection(
    () => ({
      sessionUpdate: async (params) => {
        updates.push(params)
      },
      requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
    }),
    stream,
  )
  return { connection, updates, record, dir, child }
}

async function entries(harness: Harness) {
  const content = await readFile(harness.record, "utf8").catch(() => "")
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => entry.parse(JSON.parse(line)))
}

async function starts(harness: Harness, count = 1) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const all = await entries(harness)
    const found = all.flatMap((item) => (item.type === "start" ? [item] : []))
    if (found.length >= count) return found
    await Bun.sleep(25)
  }
  return []
}

const chunkText = (harness: Harness) =>
  harness.updates.flatMap((item) => {
    const update = item.update
    if (update.sessionUpdate !== "agent_message_chunk") return []
    return update.content.type === "text" ? [update.content.text] : []
  })

async function init(harness: Harness) {
  return harness.connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
}

afterEach(() => {
  for (const child of open.splice(0)) child.kill("SIGKILL")
})

describe("void-cli-acp", () => {
  test("initialize reports protocol 1, session load and http mcp", async () => {
    const harness = await launch({})
    const response = await init(harness)
    expect(response.protocolVersion).toBe(1)
    expect(response.agentCapabilities?.loadSession).toBe(true)
    expect(response.agentCapabilities?.mcpCapabilities?.http).toBe(true)
  })

  test("a prompt streams agent_message_chunk updates and ends with end_turn", async () => {
    const harness = await launch({ STUB_FIXTURE: "stream-basic" })
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const first = await harness.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Reply with exactly one word: ok" }],
    })
    expect(first.stopReason).toBe("end_turn")
    expect(chunkText(harness)).toEqual(["ok"])
    const second = await harness.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Reply with exactly one word: done" }],
    })
    expect(second.stopReason).toBe("end_turn")
    expect(chunkText(harness)).toEqual(["ok", "done"])
    expect((await starts(harness)).length).toBe(1)
    const sent = (await entries(harness)).flatMap((item) => (item.type === "stdin" ? [JSON.parse(item.line)] : []))
    expect(sent[0]).toEqual({
      type: "user",
      uuid: expect.any(String),
      message: { role: "user", content: "Reply with exactly one word: ok" },
      parent_tool_use_id: null,
    })
  })

  test("session/new spawns the binary in cwd with the documented flags and no --bare", async () => {
    const harness = await launch({})
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const [spawned] = await starts(harness)
    const argv = spawned?.argv ?? []
    const value = (flag: string) => argv[argv.indexOf(flag) + 1]
    expect(argv).not.toContain("--bare")
    expect(argv).not.toContain("--setting-sources")
    for (const flag of ["-p", "--verbose", "--strict-mcp-config"]) expect(argv).toContain(flag)
    expect(value("--input-format")).toBe("stream-json")
    expect(value("--output-format")).toBe("stream-json")
    expect(value("--session-id")).toBe(session.sessionId)
    expect(value("--model")).toBe("opus-test")
    expect(value("--effort")).toBe("low")
    expect(value("--permission-mode")).toBe("dontAsk")
    expect(value("--permission-prompts")).toBe("none")
    expect(argv).toContain("--mcp-config")
    expect(spawned?.configDir).toBe(path.join(harness.dir, "account"))
    expect(spawned?.cwd).toBe(await realpath(harness.dir))
  })

  test("--setting-sources is passed only when given", async () => {
    const harness = await launch({}, ["--setting-sources", "project"])
    await init(harness)
    await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const [spawned] = await starts(harness)
    const argv = spawned?.argv ?? []
    expect(argv[argv.indexOf("--setting-sources") + 1]).toBe("project")
  })

  test("the mcp config file has header arrays converted to objects and mode 0600", async () => {
    const harness = await launch({})
    await init(harness)
    await harness.connection.newSession({
      cwd: harness.dir,
      mcpServers: [
        {
          type: "http",
          name: "memory",
          url: "http://127.0.0.1:9/mcp",
          headers: [
            { name: "X-Space", value: "alpha" },
            { name: "X-Token", value: "t" },
          ],
        },
      ],
    })
    const [spawned] = await starts(harness)
    const argv = spawned?.argv ?? []
    const file = text(argv[argv.indexOf("--mcp-config") + 1])
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      mcpServers: {
        memory: { type: "http", url: "http://127.0.0.1:9/mcp", headers: { "X-Space": "alpha", "X-Token": "t" } },
      },
    })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  test("closing stdin ends the shim and removes the config file", async () => {
    const harness = await launch({})
    await init(harness)
    await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const [spawned] = await starts(harness)
    const argv = spawned?.argv ?? []
    const file = text(argv[argv.indexOf("--mcp-config") + 1])
    const exited = new Promise((resolve) => harness.child.once("exit", resolve))
    harness.child.stdin?.end()
    await exited
    expect(await Bun.file(file).exists()).toBe(false)
  })

  test("a stdio mcp server is mapped to a command entry with an env object", async () => {
    const harness = await launch({})
    await init(harness)
    await harness.connection.newSession({
      cwd: harness.dir,
      mcpServers: [
        { name: "memory", command: "bun", args: ["main.ts", "--x"], env: [{ name: "VOID_MEMORY_DB", value: "/tmp/g.db" }] },
      ],
    })
    const argv = (await starts(harness))[0]?.argv ?? []
    expect(argv).toContain("--strict-mcp-config")
    const file = text(argv[argv.indexOf("--mcp-config") + 1])
    expect(await Bun.file(file).json()).toEqual({
      mcpServers: { memory: { command: "bun", args: ["main.ts", "--x"], env: { VOID_MEMORY_DB: "/tmp/g.db" } } },
    })
  })

  test("session/cancel sends an interrupt and the turn ends with cancelled", async () => {
    const harness = await launch({ STUB_FIXTURE: "stream-interrupt" })
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const pending = harness.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Write a 1200-word essay about the history of tea. Plain prose, no tools." }],
    })
    await harness.connection.cancel({ sessionId: session.sessionId })
    const response = await pending
    expect(response.stopReason).toBe("cancelled")
    const sent = (await entries(harness)).flatMap((item) => (item.type === "stdin" ? [JSON.parse(item.line)] : []))
    expect(sent[1]?.type).toBe("control_request")
    expect(sent[1]?.request?.subtype).toBe("interrupt")
    expect(typeof sent[1]?.request_id).toBe("string")
    expect((await starts(harness)).length).toBe(1)
  })

  test("without a control_response the shim sends SIGINT and respawns with --resume on the next prompt", async () => {
    const harness = await launch({ STUB_FIXTURE: "stream-interrupt", STUB_IGNORE_INTERRUPT: "1" }, [
      "--interrupt-timeout-ms",
      "100",
    ])
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const pending = harness.connection.prompt({ sessionId: session.sessionId, prompt: [{ type: "text", text: "essay" }] })
    await harness.connection.cancel({ sessionId: session.sessionId })
    expect((await pending).stopReason).toBe("cancelled")
    harness.connection
      .prompt({ sessionId: session.sessionId, prompt: [{ type: "text", text: "again" }] })
      .catch(() => undefined)
    const all = await starts(harness, 2)
    expect(all.length).toBe(2)
    const argv = all[1]?.argv ?? []
    expect(argv[argv.indexOf("--resume") + 1]).toBe(session.sessionId)
    expect(argv).not.toContain("--session-id")
    expect(argv).not.toContain("--bare")
  })

  test("session/load respawns the binary with --resume", async () => {
    const harness = await launch({})
    await init(harness)
    await harness.connection.loadSession({ sessionId: "11111111-2222-4333-8444-555555555555", cwd: harness.dir, mcpServers: [] })
    const [spawned] = await starts(harness)
    const argv = spawned?.argv ?? []
    expect(argv[argv.indexOf("--resume") + 1]).toBe("11111111-2222-4333-8444-555555555555")
    expect(argv).not.toContain("--session-id")
  })

  test("a binary that exits mid-turn fails the prompt", async () => {
    const harness = await launch({ STUB_FAIL_TURN: "1" })
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const error = await harness.connection
      .prompt({ sessionId: session.sessionId, prompt: [{ type: "text", text: "x" }] })
      .catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
  })

  test("a result that precedes the echo of the prompt belongs to an earlier turn and is ignored", async () => {
    const harness = await launch({ STUB_FIXTURE: "stream-basic", STUB_STALE_TURN: "1" })
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const response = await harness.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Reply with exactly one word: ok" }],
    })
    expect(response.stopReason).toBe("end_turn")
    expect(chunkText(harness)).toEqual(["ok"])
  })

  test("the binary is started with replay of user messages", async () => {
    const harness = await launch({})
    await init(harness)
    await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const [spawned] = await starts(harness)
    expect(spawned?.argv).toContain("--replay-user-messages")
  })

  test("the prompt response carries the shim timing", async () => {
    const harness = await launch({ STUB_FIXTURE: "stream-basic" })
    await init(harness)
    const session = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] })
    const before = Date.now()
    const response = await harness.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Reply with exactly one word: ok" }],
    })
    const timing = z.object({ stdinAt: z.number(), binaryFirstAt: z.number() }).parse(response._meta?.["voidTiming"])
    expect(timing.stdinAt).toBeGreaterThanOrEqual(before)
    expect(timing.binaryFirstAt).toBeGreaterThanOrEqual(timing.stdinAt)
  })

  test("a missing binary fails session/new", async () => {
    const harness = await launch({}, ["--binary", path.join(here, "does-not-exist")])
    await init(harness)
    const error = await harness.connection.newSession({ cwd: harness.dir, mcpServers: [] }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
  })
})
