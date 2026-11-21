import net from "node:net"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import delegate from "../../desktop/resources/tools/delegate"

const stateDir = process.env["LATENCY_STATE_DIR"] ?? ""
const worker = process.env["LATENCY_WORKER"] ?? "sub-worker"
const runs = Number(process.env["LATENCY_RUNS"] ?? "20")
const out = process.env["LATENCY_OUT"] ?? ""
const prompt = process.env["LATENCY_PROMPT"] ?? "Reply with the single word: ok"

if (!stateDir) throw new Error("LATENCY_STATE_DIR is required")
process.env["VOID_BROKER_SOCKET"] = path.join(stateDir, "broker.sock")

let firstEventAt = 0
const connect = net.connect.bind(net)
Object.assign(net, {
  connect: (...args: Parameters<typeof net.connect>) => {
    const socket = connect(...args)
    socket.prependListener("data", (chunk: Buffer | string) => {
      if (!firstEventAt && String(chunk).includes('"delegate.event"')) firstEventAt = Date.now()
    })
    return socket
  },
})

type Sample = { runId: string; executeAt: number; clientEventAt: number }

const once = async (fresh: boolean): Promise<Sample> => {
  firstEventAt = 0
  const controller = new AbortController()
  const executeAt = Date.now()
  const result = (await (delegate as any).execute(
    { worker, prompt, fresh },
    { abort: controller.signal, sessionID: "latency", messageID: "latency", agent: "latency", directory: process.cwd(), worktree: process.cwd(), metadata() {}, ask: async () => {} },
  )) as { metadata: { runId: string } }
  return { runId: result.metadata.runId, executeAt, clientEventAt: firstEventAt }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}
const summarize = (values: number[]) => ({ min: Math.min(...values), p50: median(values), p95: pct(values, 95), max: Math.max(...values) })

await once(true)
const samples: Sample[] = []
for (let i = 0; i < runs; i++) samples.push(await once(false))

const log = (await readFile(path.join(stateDir, "log", "runs.jsonl"), "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Record<string, number | string | null>)
const byRun = new Map(log.map((record) => [record["runId"], record]))

const rows = samples.map((sample) => {
  const record = byRun.get(sample.runId)
  if (!record) throw new Error(`run ${sample.runId} missing from the run log`)
  const n = (key: string) => {
    const value = record[key]
    if (typeof value !== "number") throw new Error(`run ${sample.runId} has no ${key}`)
    return value
  }
  const startedAt = n("startedAt")
  const stdinAt = n("stdinAt")
  const binaryFirstAt = n("binaryFirstAt")
  const brokerFirstAt = n("firstEventAt")
  const total = sample.clientEventAt - sample.executeAt
  const worker = binaryFirstAt - stdinAt
  return {
    runId: sample.runId,
    total,
    worker,
    overhead: total - worker,
    socketBroker: startedAt - sample.executeAt,
    brokerShim: stdinAt - startedAt,
    shimBroker: brokerFirstAt - binaryFirstAt,
    brokerTool: sample.clientEventAt - brokerFirstAt,
  }
})

const keys = ["total", "worker", "overhead", "socketBroker", "brokerShim", "shimBroker", "brokerTool"] as const
const summary = Object.fromEntries(keys.map((key) => [key, summarize(rows.map((row) => row[key]))]))
console.log(JSON.stringify(summary, null, 1))
console.log(`gate p50 < 20 ms: ${summary.overhead.p50 < 20 ? "pass" : "fail"}`)
if (out) await writeFile(out, JSON.stringify({ rows, summary }, null, 1) + "\n")
