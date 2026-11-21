import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/db"
import { createStore } from "../src/store"

interface WorkerReport {
  name: string
  errors: string[]
  wins: string[]
  writes: number
  elapsed: number
}

const count = 400

const spawn = (path: string, name: string, startAt: number) =>
  Bun.spawn(["bun", join(import.meta.dir, "process-worker.ts"), path, name, String(count), String(startAt)], {
    stdout: "pipe",
    stderr: "pipe",
  })

test("two processes write one wal file without busy errors and claim each task once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "void-memory-mp-"))
  const path = join(dir, "graph.db")
  const { db } = openDatabase(path)
  const store = createStore(db)
  for (let i = 0; i < count; i++) store.task.create({ id: `t${i}`, title: `task ${i}` }, { agent: "main" })

  const startAt = Date.now() + 600
  const procs = [spawn(path, "w1", startAt), spawn(path, "w2", startAt)]
  const outputs = await Promise.all(
    procs.map(async (proc) => {
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
      return { out, err, code }
    }),
  )
  for (const output of outputs) {
    expect(output.err).toBe("")
    expect(output.code).toBe(0)
  }
  const reports: WorkerReport[] = outputs.map((output) => JSON.parse(output.out))

  for (const report of reports) {
    expect(report.errors).toEqual([])
    expect(report.writes).toBe(count)
  }
  const all = reports.flatMap((report) => report.wins)
  expect(all).toHaveLength(count)
  expect(new Set(all).size).toBe(count)

  const counts = (sql: string) => db.query<{ c: number }, []>(sql).get()?.c
  expect(counts("select count(*) c from node where kind = 'fact'")).toBe(count * 4)
  expect(counts("select count(*) c from node where kind = 'entity'")).toBe(count * 2)
  expect(counts("select count(*) c from edge where type in ('relates_to','about')")).toBe(count * 4)
  expect(counts("select count(*) c from task_event where to_status = 'claimed'")).toBe(count)
  expect(counts("select count(*) c from node where kind = 'task' and json_extract(props, '$.status') = 'claimed'")).toBe(count)
  expect(db.query("pragma integrity_check").get()).toEqual({ integrity_check: "ok" })
  expect(store.recall({ query: "contention", hops: 0, limit: 5 }).nodes.length).toBe(5)

  const ops = reports.map((report) => `${report.name}: ${report.writes} remember + ${report.wins.length} claim wins of ${count} attempts in ${report.elapsed.toFixed(0)} ms`)
  console.log(ops.join("\n"))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}, 60000)
