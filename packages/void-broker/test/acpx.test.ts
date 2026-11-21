import { afterEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { AcpxWorkerLink } from "../src/acpx"
import { createFakeWorker } from "../src/fake"
import { createLinkFactory, resolveMcp } from "../src/links"
import type { WorkerEvent } from "../src/types"
import type { WorkerEntry } from "../src/workers"
import { tempDir, text } from "./helpers"

const here = path.dirname(fileURLToPath(import.meta.url))
const stub = path.join(here, "stub-binary.ts")

const entry = z.union([
  z.object({ type: z.literal("start"), pid: z.number(), argv: z.array(z.string()), configDir: z.string().nullable() }),
  z.object({ type: z.literal("stdin"), line: z.string() }),
])

const open: AcpxWorkerLink[] = []

async function link(overrides: Partial<ConstructorParameters<typeof AcpxWorkerLink>[0]> = {}) {
  const dir = await tempDir()
  const record = path.join(dir, "record.jsonl")
  const entry: WorkerEntry = {
    id: "w1",
    backend: "anthropic-cli",
    model: "sonnet",
    effort: "low",
    mode: "bypassPermissions",
    account: path.join(dir, "account"),
    mcp: [],
    warm: false,
    description: "",
  }
  const created = new AcpxWorkerLink({
    entry,
    stateDir: path.join(dir, "state"),
    cwd: dir,
    mcpServers: [],
    shimArgs: ["--binary", stub],
    env: { STUB_RECORD: record },
    ...overrides,
  })
  open.push(created)
  return { created, record, dir, entry }
}

async function records(file: string) {
  const content = await readFile(file, "utf8").catch(() => "")
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => entry.parse(JSON.parse(line)))
}

async function run(worker: AcpxWorkerLink, prompt: string) {
  const events: WorkerEvent[] = []
  for await (const event of worker.prompt(prompt)) events.push(event)
  return events
}

afterEach(async () => {
  await Promise.allSettled(open.splice(0).map((item) => item.close()))
})

describe("AcpxWorkerLink", () => {
  test("three prompts give three results in one process with one session id", async () => {
    const { created, record } = await link()
    await created.start()
    const results = []
    for (const prompt of ["one", "two", "three"]) {
      const events = await run(created, prompt)
      const last = events.at(-1)
      expect(last?.type).toBe("result")
      results.push(last)
    }
    expect(results.map((item) => (item?.type === "result" ? item.stopReason : ""))).toEqual(["end_turn", "end_turn", "end_turn"])
    const all = await records(record)
    const starts = all.flatMap((item) => (item.type === "start" ? [item] : []))
    expect(starts.length).toBe(1)
    expect(all.filter((item) => item.type === "stdin").length).toBe(3)
    const argv = starts[0]?.argv ?? []
    expect(argv[argv.indexOf("--session-id") + 1]).toBe(created.info().sessionId)
    expect(created.info().pid).toBeGreaterThan(0)
    expect(argv).not.toContain("--bare")
  })

  test("prompt yields chunk events then a result with the joined text", async () => {
    const { created } = await link()
    await created.start()
    const events = await run(created, "hi")
    const kinds = events.map((item) => item.type)
    expect(kinds.at(-1)).toBe("result")
    expect(events.some((item) => item.type === "event" && item.kind === "agent_message_chunk" && item.text === "ok")).toBe(true)
    const last = events.at(-1)
    expect(last?.type === "result" ? last.text : "").toBe("ok")
  })

  test("the shim argv carries model, effort, mode and account, and no setting sources by default", async () => {
    const { created, record, dir } = await link()
    await created.start()
    const argv = (await records(record)).flatMap((item) => (item.type === "start" ? [item.argv] : []))[0] ?? []
    expect(argv[argv.indexOf("--model") + 1]).toBe("sonnet")
    expect(argv[argv.indexOf("--effort") + 1]).toBe("low")
    expect(argv[argv.indexOf("--permission-mode") + 1]).toBe("bypassPermissions")
    expect(argv).not.toContain("--setting-sources")
    const start = (await records(record)).find((item) => item.type === "start")
    expect(start?.type === "start" ? start.configDir : "").toBe(path.join(dir, "account"))
  })

  test("settingSources is passed only when set", async () => {
    const { created, record } = await link({
      entry: { id: "w2", backend: "anthropic-cli", mcp: [], warm: false, description: "", settingSources: "project" },
    })
    await created.start()
    const argv = (await records(record)).flatMap((item) => (item.type === "start" ? [item.argv] : []))[0] ?? []
    expect(argv[argv.indexOf("--setting-sources") + 1]).toBe("project")
  })

  test("a stdio mcp server reaches the mcp config file", async () => {
    const { created, record } = await link({
      mcpServers: [{ name: "memory", command: "bun", args: ["m.ts"], env: [{ name: "VOID_MEMORY_DB", value: "/tmp/x.db" }] }],
    })
    await created.start()
    const argv = (await records(record)).flatMap((item) => (item.type === "start" ? [item.argv] : []))[0] ?? []
    expect(argv).toContain("--strict-mcp-config")
    const file = text(argv[argv.indexOf("--mcp-config") + 1])
    const config = z.object({ mcpServers: z.record(z.string(), z.unknown()) }).parse(await Bun.file(file).json())
    expect(Object.keys(config.mcpServers)).toEqual(["memory"])
  })

  test("the session record is written under the state dir", async () => {
    const { created, dir } = await link()
    await created.start()
    await run(created, "hi")
    const files = await Array.fromAsync(new Bun.Glob("**/*.json").scan({ cwd: path.join(dir, "state") }))
    expect(files.length).toBeGreaterThan(0)
  })

  test("a new link on the same state dir resumes the same session id", async () => {
    const first = await link()
    await first.created.start()
    await run(first.created, "hi")
    const id = first.created.info().sessionId
    await first.created.close()
    const second = await link({
      entry: first.entry,
      stateDir: path.join(first.dir, "state"),
      cwd: first.dir,
      env: { STUB_RECORD: first.record },
    })
    await second.created.start()
    await run(second.created, "again")
    const starts = (await records(first.record)).flatMap((item) => (item.type === "start" ? [item.argv] : []))
    expect(starts.length).toBe(2)
    const argv = starts[1] ?? []
    expect(argv[argv.indexOf("--resume") + 1]).toBe(id)
    expect(second.created.info().sessionId).toBe(id)
  })

  test("cancel ends the turn with cancelled", async () => {
    const { created } = await link({ env: { STUB_RECORD: "/dev/null", STUB_FIXTURE: "stream-interrupt" } })
    await created.start()
    const pending = run(created, "long")
    await Bun.sleep(300)
    await created.cancel()
    const events = await pending
    const last = events.at(-1)
    expect(last?.type === "result" ? last.stopReason : "").toBe("cancelled")
  })

  test("health reports stopped before start and running after", async () => {
    const { created } = await link()
    expect((await created.health()).ok).toBe(false)
    await created.start()
    expect((await created.health()).ok).toBe(true)
    await created.close()
    expect((await created.health()).ok).toBe(false)
  })
})

describe("link factory", () => {
  test("resolveMcp maps memory to the stdio server with the db path and the worker id", () => {
    const servers = resolveMcp(["memory"], { memoryDb: "/s/data/memory/graph.db", memoryMain: "/m/main.ts", workerId: "w1" })
    expect(servers).toEqual([
      {
        name: "memory",
        command: process.execPath,
        args: ["/m/main.ts"],
        env: [
          { name: "VOID_MEMORY_DB", value: "/s/data/memory/graph.db" },
          { name: "VOID_MEMORY_AGENT", value: "w1" },
        ],
      },
    ])
  })

  test("resolveMcp rejects an unknown name", () => {
    expect(() => resolveMcp(["hub"], { memoryDb: "/d", memoryMain: "/m", workerId: "w" })).toThrow("unknown mcp server: hub")
  })

  test("the factory builds an AcpxWorkerLink for anthropic-cli and delegates other backends", async () => {
    const dir = await tempDir()
    const marker = createFakeWorker()
    const factory = createLinkFactory({
      stateDir: dir,
      cwd: dir,
      memoryDb: path.join(dir, "g.db"),
      fallback: () => marker,
    })
    const base = { id: "a", mcp: [], warm: false, description: "" }
    expect(factory({ ...base, backend: "anthropic-cli" })).toBeInstanceOf(AcpxWorkerLink)
    expect(factory({ ...base, backend: "acp" })).toBe(marker)
  })
})
