import { execFileSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { openDatabase } from "../../void-memory/src/db"
import { createStore } from "../../void-memory/src/store"
import { AcpxWorkerLink } from "../src/acpx"
import { resolveMcp } from "../src/links"
import type { WorkerEntry } from "../src/workers"

delete process.env["ANTHROPIC_API_KEY"]
delete process.env["ANTHROPIC_AUTH_TOKEN"]

const account = path.join(os.homedir(), ".claude-void")
const root = await mkdtemp(path.join(os.tmpdir(), "void-step4-"))
const memoryDb = path.join(root, "data/memory/graph.db")
const tee = path.join(root, "events.jsonl")
const wrapper = path.join(root, "claude-tee.sh")
await mkdir(path.dirname(memoryDb), { recursive: true })
await writeFile(wrapper, `#!/bin/bash\nclaude "$@" | tee -a "${tee}"\n`)
await chmod(wrapper, 0o755)
await writeFile(tee, "")
const memoryMain = path.join(import.meta.dir, "../../void-memory/src/main.ts")

const say = (label: string, value: unknown) => console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`)

const entry = (id: string): WorkerEntry => ({
  id,
  backend: "anthropic-cli",
  model: "sonnet",
  effort: "low",
  mode: "bypassPermissions",
  account,
  mcp: ["memory"],
  warm: false,
  description: id,
})

const makeLink = (id: string, stateDir: string) =>
  new AcpxWorkerLink({
    entry: entry(id),
    stateDir,
    cwd: root,
    mcpServers: resolveMcp(["memory"], { memoryDb, memoryMain, workerId: id }),
    shimArgs: ["--binary", wrapper],
  })

async function ask(link: AcpxWorkerLink, text: string) {
  for await (const event of link.prompt(text)) if (event.type === "result") return event
  throw new Error("no result")
}

function descendants(pid: number) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .flatMap((match) => (match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] ?? "" }] : []))
  const found: typeof rows = []
  let frontier = [pid]
  while (frontier.length > 0) {
    const next = rows.filter((row) => frontier.includes(row.ppid))
    found.push(...next)
    frontier = next.map((row) => row.pid)
  }
  return found
}

const binaryPid = (shimPid: number) => descendants(shimPid).find((row) => row.command.startsWith("claude "))?.pid ?? 0

const events = async () =>
  (await readFile(tee, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => z.record(z.string(), z.unknown()).catch({}).parse(JSON.parse(line)))

say("api key env", process.env["ANTHROPIC_API_KEY"] === undefined ? "absent" : "present")
say("config dir", account)

console.log("== (a) three prompts in one worker")
const stateA = path.join(root, "state-a")
const a = makeLink("wa", stateA)
await a.start()
const words = ["pineapple", "two", "three"]
const pids = new Set<number>()
const sessions = new Set<string>()
for (const [index, word] of words.entries()) {
  const result = await ask(a, `Reply with exactly one word: ${word}`)
  const info = a.info()
  const pid = binaryPid(info.pid)
  pids.add(pid)
  sessions.add(info.sessionId)
  say(`turn ${index + 1}`, { stopReason: result.stopReason, text: result.text.trim(), shimPid: info.pid, binaryPid: pid, sessionId: info.sessionId })
}
say("(a) distinct binary pids", [...pids])
say("(a) distinct session ids", [...sessions])
say("(a) PASS", pids.size === 1 && sessions.size === 1 && !pids.has(0))

console.log("== (b) tool list from the init event")
const inits = (await events()).filter((item) => item["type"] === "system" && item["subtype"] === "init")
const init = inits[0] ?? {}
say("init events seen", inits.length)
say("mcp_servers", init["mcp_servers"])
const tools = Array.isArray(init["tools"]) ? init["tools"].filter((tool): tool is string => typeof tool === "string") : []
say("mcp tool names", tools.filter((tool) => tool.startsWith("mcp__")))
say("init model", init["model"])
say("init permissionMode", init["permissionMode"])
const servers = Array.isArray(init["mcp_servers"]) ? init["mcp_servers"] : []
say("(b) only memory", servers.length === 1)

console.log("== (e) rate limit and result events from the same run")
for (const item of (await events()).filter((entry) => entry["type"] === "rate_limit_event").slice(0, 2)) say("rate_limit_event", item)
const lastResult = (await events()).filter((item) => item["type"] === "result").at(-1) ?? {}
say("result fields", { ...lastResult, result: undefined })

console.log("== (d) model, effort and resume")
say("model flag", `sonnet -> init model ${String(init["model"])}`)
const shimArgv = descendants(a.info().pid).find((row) => row.command.startsWith("claude "))?.command ?? ""
say("binary argv", shimArgv.replace(/--mcp-config \S+/, "--mcp-config <file>"))
const firstSession = a.info().sessionId
await a.close()
const a2 = makeLink("wa", stateA)
await a2.start()
const recall = await ask(a2, "Which fruit word did I ask you to say in my first message? Reply with exactly that one word.")
const info2 = a2.info()
say("resume turn", { stopReason: recall.stopReason, text: recall.text.trim(), sessionId: info2.sessionId, sameSessionId: info2.sessionId === firstSession })
say("resume binary argv", descendants(info2.pid).find((row) => row.command.startsWith("claude "))?.command.replace(/--mcp-config \S+/, "--mcp-config <file>"))
say("(d) resume PASS", recall.text.toLowerCase().includes("pineapple") && info2.sessionId === firstSession)
await a2.close()

console.log("== (c) two workers claim one task")
const { db } = openDatabase(memoryDb)
const store = createStore(db)
const task = store.task.create({ title: "step4 claim race", brief: "claim race" }, { agent: "step4-check" })
say("task created", { id: task.id, status: task.status })
const left = makeLink("wl", path.join(root, "state-l"))
const right = makeLink("wr", path.join(root, "state-r"))
await Promise.all([left.start(), right.start()])
const prompt = `Call the task_claim tool for task ${task.id}. Reply with exactly one word: WON if the result says claimed true, otherwise LOST.`
const [one, two] = await Promise.all([ask(left, prompt), ask(right, prompt)])
say("worker wl", { stopReason: one.stopReason, text: one.text.trim() })
say("worker wr", { stopReason: two.stopReason, text: two.text.trim() })
const final = store.task.list({}).find((row) => row.id === task.id)
say("final task row", final)
const wins = [one, two].filter((item) => item.text.toUpperCase().includes("WON")).length
say("(c) PASS", wins === 1 && final?.status === "claimed")
await Promise.all([left.close(), right.close()])

const home = await Bun.file(path.join(os.homedir(), ".acpx")).exists()
say("~/.acpx exists", home)
say("work dir", root)
process.exit(0)
