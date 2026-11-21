import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { Database } from "../src/sqlite"
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/db"
import { defaultFanout, expansionSql } from "../src/memory"
import { createStore } from "../src/store"

const outDir = join(homedir(), ".void/spikes/m9-graph-memory")
const scratch = join(outDir, "scratch")
const reportPath = process.env.BENCH_REPORT ?? join(outDir, "bench-server-report.md")
const fanouts = (process.env.BENCH_FANOUT ?? "").split(",").filter((v) => v !== "").map(Number)
const withAnalyze = process.env.BENCH_ANALYZE !== "0"
const variants = (process.env.BENCH_VARIANTS ?? "uniform,skewed").split(",")
const mainPath = process.env.BENCH_SERVER_ENTRY ?? join(import.meta.dir, "../src/main.ts")
const serverCommand = process.env.BENCH_SERVER_CMD ?? process.execPath

let seed = 12345
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
const ri = (n: number) => Math.floor(rnd() * n)

const ru =
  "память граф задача агент проект решение факт ссылка поиск запись пространство воркер результат ошибка очередь сервер модуль данные схема индекс запрос узел связь версия сессия контекст команда план отчёт ёмкость щётка тест сборка релиз файл папка ключ доступ роль правило событие журнал снимок копия".split(
    " ",
  )
const en =
  "memory graph task agent project decision fact link search write space worker result error queue server module data schema index query node edge version session context command plan report test build release file folder key access role rule event journal snapshot copy".split(
    " ",
  )
const words: string[] = []
for (let i = 0; i < 400; i++) {
  const base = i % 2 ? ru[i % ru.length] : en[i % en.length]
  words.push(base + (i >= ru.length ? String(i) : ""))
}
const phrase = (n: number) => Array.from({ length: n }, () => words[ri(words.length)]).join(" ")
const query = () => `${words[ri(words.length)]} ${words[ri(words.length)]}`

const N = 100000
const E = 500000
const hubs = 5
const hubDegree = 10000
const kinds = ["entity", "fact", "decision", "result", "project", "agent", "session", "doc"]
const etypes = ["about", "relates_to", "part_of", "decided_in", "supersedes", "parent_of", "assigned_to", "derived_from"]

const build = (path: string, skewed: boolean) => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true })
  const { db } = openDatabase(path)
  const now = Date.now()
  const insNode = db.prepare(
    "insert into node(id,kind,project,scope,title,body,props,created_by,session_id,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
  )
  const insEdge = db.prepare("insert or ignore into edge(src,dst,type,props,created_at) values(?,?,?,?,?)")
  const started = performance.now()
  const nodes = db.transaction((from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const task = i % 20 === 0
      insNode.run(
        `n${i}`,
        task ? "task" : kinds[ri(kinds.length)],
        `p${1 + ri(5)}`,
        "shared",
        phrase(3 + ri(3)),
        phrase(15 + ri(15)),
        task ? '{"status":"open"}' : "{}",
        "main",
        `s${ri(100)}`,
        now,
        now,
      )
    }
  })
  for (let i = 0; i < N; i += 1000) nodes(i, i + 1000)
  if (skewed) {
    for (let h = 0; h < hubs; h++) insNode.run(`hub${h}`, "entity", "p1", "shared", `hubword${h} central entity`, phrase(10), "{}", "main", "s1", now, now)
  }
  const edgeCount = skewed ? E - hubs * hubDegree : E
  const edges = db.transaction((count: number) => {
    for (let i = 0; i < count; i++) insEdge.run(`n${ri(N)}`, `n${ri(N)}`, etypes[ri(etypes.length)], "{}", now)
  })
  for (let i = 0; i < edgeCount; i += 10000) edges(Math.min(10000, edgeCount - i))
  if (skewed) {
    const hubEdges = db.transaction((h: number) => {
      for (let i = 0; i < hubDegree; i++) {
        if (i % 2) insEdge.run(`hub${h}`, `n${ri(N)}`, etypes[ri(etypes.length)], "{}", now)
        else insEdge.run(`n${ri(N)}`, `hub${h}`, etypes[ri(etypes.length)], "{}", now)
      }
    })
    for (let h = 0; h < hubs; h++) hubEdges(h)
  }
  const loadMs = performance.now() - started
  const counts = {
    nodes: db.query<{ c: number }, []>("select count(*) c from node").get()?.c ?? 0,
    edges: db.query<{ c: number }, []>("select count(*) c from edge").get()?.c ?? 0,
  }
  db.run("pragma wal_checkpoint(truncate)")
  db.close()
  return { loadMs, ...counts, bytes: statSync(path).size }
}

const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}
const stat = (values: number[]) => ({ p50: pct(values, 0.5), p95: pct(values, 0.95) })
const fmt = (s: { p50: number; p95: number }) => `p50 ${s.p50.toFixed(3)} ms, p95 ${s.p95.toFixed(3)} ms`

const measure = async (run: () => unknown, runs = 200, warm = 10) => {
  for (let i = 0; i < warm; i++) await run()
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    await run()
    times.push(performance.now() - started)
  }
  return stat(times)
}

const rss = (pid: number) => {
  const out = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(pid)]).stdout.toString().trim()
  return Number(out) / 1024
}

const serverRun = async (path: string, skewed: boolean, fanout?: number) => {
  const transport = new StdioClientTransport({
    command: serverCommand,
    args: [mainPath],
    env: { PATH: process.env.PATH ?? "", VOID_MEMORY_DB: path, ...(fanout === undefined ? {} : { VOID_MEMORY_FANOUT: String(fanout) }) },
    stderr: "inherit",
  })
  const client = new Client({ name: "bench", version: "0" })
  const started = performance.now()
  await client.connect(transport)
  const startMs = performance.now() - started
  const pid = transport.pid
  if (pid === null) throw new Error("no pid")
  await Bun.sleep(1000)
  const idle = rss(pid)
  let counter = 0
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
  const results: Record<string, { p50: number; p95: number }> = {}
  results.remember = await measure(() => {
    const k = counter++
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      ref: `r${i}`,
      id: `b${k}-${i}`,
      kind: "fact",
      project: "p1",
      title: phrase(4),
      body: phrase(20),
    }))
    const edges = Array.from({ length: 8 }, (_, i) => ({
      src: `r${i % 5}`,
      dst: i < 4 ? `n${ri(N)}` : `r${(i + 1) % 5}`,
      type: "relates_to",
    }))
    return call("remember", { nodes, edges, agent: "bench" })
  })
  results["recall hybrid hops 1"] = await measure(() => call("recall", { query: query(), hops: 1, agent: "bench" }))
  results["recall hybrid hops 2"] = await measure(() => call("recall", { query: query(), hops: 2, agent: "bench" }))
  if (skewed) {
    let h = 0
    results["recall hub hops 1"] = await measure(() => call("recall", { query: `hubword${h++ % hubs}`, hops: 1, agent: "bench" }))
    results["recall hub hops 2"] = await measure(() => call("recall", { query: `hubword${h++ % hubs}`, hops: 2, agent: "bench" }))
  }
  const after = rss(pid)
  await client.close()
  return { startMs, idle, after, results }
}

const plan = (db: Database, sql: string, params: (string | number | null)[]) =>
  db
    .query<{ id: number; parent: number; detail: string }, (string | number | null)[]>(`explain query plan ${sql}`)
    .all(...params)
    .map((row) => `${row.id} ${row.parent} ${row.detail}`)
    .join("\n")

const seedSql = `select n.id as id, -bm25(node_fts) as rank from node_fts join node n on n.rowid = node_fts.rowid where node_fts match ?1 and (n.scope = 'shared' or n.scope = ?2) and n.invalidated_at is null order by -bm25(node_fts) desc limit ?3`

const inProcess = async (path: string, skewed: boolean, fanout?: number) => {
  const db = new Database(path, { readonly: true })
  const store = createStore(openDatabase(path).db, { fanout })
  const out: Record<string, { p50: number; p95: number }> = {}
  out["in-process recall hops 1"] = await measure(() => store.recall({ query: query(), hops: 1, agent: "bench" }))
  out["in-process recall hops 2"] = await measure(() => store.recall({ query: query(), hops: 2, agent: "bench" }))
  const sql = expansionSql(false, 300)
  const seeds = () => JSON.stringify(Array.from({ length: 10 }, () => `n${ri(N)}`))
  const bound = fanout ?? defaultFanout
  const q = db.query<{ id: string; d: number; seed: string }, (string | number | null)[]>(sql)
  out["expansion sql, 10 random seeds, 1 hop"] = await measure(() => q.all(seeds(), 1, null, bound))
  out["expansion sql, 10 random seeds, 2 hops"] = await measure(() => q.all(seeds(), 2, null, bound))
  const rows = (hops: number, json: string) => q.all(json, hops, null, bound).length
  const oneSeed = db.query<{ id: string; d: number; seed: string }, (string | number | null)[]>(sql)
  out["expansion sql, 1 random seed, 1 hop"] = await measure(() => oneSeed.all(JSON.stringify([`n${ri(N)}`]), 1, null, bound))
  const spike = db.query(
    `with recursive walk(id,d) as (select ?1,0 union select e.dst,w.d+1 from walk w join edge e on e.src=w.id where w.d<1 and e.invalidated_at is null union select e.src,w.d+1 from walk w join edge e on e.dst=w.id where w.d<1 and e.invalidated_at is null) select n.id,n.title,w.d from walk w join node n on n.id=w.id limit 200`,
  )
  out["spike query shape, 1 random seed, 1 hop"] = await measure(() => spike.all(`n${ri(N)}`))
  const extra: string[] = []
  extra.push(`mean rows, 10 random seeds: hops 1 = ${(Array.from({ length: 50 }, () => rows(1, seeds())).reduce((a, b) => a + b, 0) / 50).toFixed(1)}, hops 2 = ${(Array.from({ length: 50 }, () => rows(2, seeds())).reduce((a, b) => a + b, 0) / 50).toFixed(1)}`)
  if (skewed) {
    out["expansion sql, hub0 seed, 1 hop"] = await measure(() => q.all(JSON.stringify(["hub0"]), 1, null, bound))
    out["expansion sql, hub0 seed, 2 hops"] = await measure(() => q.all(JSON.stringify(["hub0"]), 2, null, bound))
    extra.push(`rows for hub0 seed: hops 1 = ${rows(1, JSON.stringify(["hub0"]))}, hops 2 = ${rows(2, JSON.stringify(["hub0"]))} (cap 300)`)
    extra.push(`recall node count for hub0 query hops 2: ${store.recall({ query: "hubword0", hops: 2 }).nodes.length}`)
  }
  const plans = [
    `expansion (same SQL for 1 and 2 hops; hop depth is the bound parameter ?2):\n${plan(db, sql, [seeds(), 1, null, bound])}`,
    `seed query (fts):\n${plan(db, seedSql, ['"память" "очередь"', null, 10])}`,
  ]
  db.close()
  return { out, plans, extra }
}

const analyzeDb = (path: string) => {
  const { db } = openDatabase(path)
  db.run("analyze")
  db.run("pragma wal_checkpoint(truncate)")
  db.close()
}

const lines: string[] = []
const emit = (line = "") => {
  lines.push(line)
  console.log(line)
}

mkdirSync(scratch, { recursive: true })
const version = new Database(":memory:").query<{ v: string }, []>("select sqlite_version() v").get()?.v
emit("# Server benchmark gate: void-memory over stdio")
emit()
emit(`Date: ${new Date().toISOString().slice(0, 10)}. Command: \`bun run bench\` in packages/void-memory (script/bench.ts).`)
emit(`- Machine: ${Bun.spawnSync(["sysctl", "-n", "machdep.cpu.brand_string"]).stdout.toString().trim()}`)
emit(`- Bun: ${Bun.version}; sqlite_version(): ${version}; server command: ${serverCommand} ${mainPath}`)
emit("- Preload: written directly through prepared SQL on the store's schema (not through the tools), then main.ts is started over stdio (SDK StdioClientTransport) and measured from the client side; each call includes JSON-RPC and process-pipe cost.")
emit("- 200 runs after 10 warm-up runs per measure. Thresholds: remember p95 <= 20 ms, recall p95 <= 50 ms.")
emit("- Recall queries are two random vocabulary words (AND, falling back to OR), limit 10 (default), caller agent bench.")

for (const name of variants) {
  const skewed = name === "skewed"
  const path = join(scratch, `${name}.db`)
  emit()
  emit(`## Variant: ${name}`)
  const built = build(path, skewed)
  emit(`- Loaded ${built.nodes} nodes, ${built.edges} edges in ${(built.loadMs / 1000).toFixed(1)} s; file ${(built.bytes / 1048576).toFixed(1)} MiB${skewed ? `; ${hubs} hub nodes (hub0..hub${hubs - 1}, title word hubword<i>) with about ${hubDegree} edges each` : ""}.`)
  for (const fanout of fanouts.length > 0 ? fanouts : [undefined]) {
    for (const analyzed of withAnalyze ? [false, true] : [false]) {
      if (analyzed) analyzeDb(path)
      const run = await serverRun(path, skewed, fanout)
      emit()
      emit(`### ${name}, fan-out ${fanout ?? defaultFanout}, ${analyzed ? "after ANALYZE" : "no ANALYZE (as the server runs it)"}`)
      emit(`- Server start to initialize: ${run.startMs.toFixed(0)} ms`)
      emit(`- RSS idle (1 s after start, before any call): ${run.idle.toFixed(1)} MiB; after the benchmark: ${run.after.toFixed(1)} MiB`)
      for (const [label, value] of Object.entries(run.results)) {
        const limit = label === "remember" ? 20 : 50
        emit(`- ${label}: ${fmt(value)} (${value.p95 <= limit ? "within" : "OVER"} ${limit} ms)`)
      }
      const direct = await inProcess(path, skewed, fanout)
      emit(`- Direct (no stdio, same file):`)
      for (const [label, value] of Object.entries(direct.out)) emit(`  - ${label}: ${fmt(value)}`)
      for (const line of direct.extra) emit(`  - ${line}`)
      emit()
      emit(`Query plans (${analyzed ? "after ANALYZE" : "no ANALYZE"}):`)
      for (const p of direct.plans) emit("```\n" + p + "\n```")
    }
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true })
}
writeFileSync(reportPath, lines.join("\n") + "\n")
