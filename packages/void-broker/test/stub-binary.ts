#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs"
import { createInterface } from "node:readline"

const record = process.env["STUB_RECORD"] ?? ""
const name = process.env["STUB_FIXTURE"] ?? "stream-basic"
const ignoreInterrupt = process.env["STUB_IGNORE_INTERRUPT"] === "1"
const failTurn = process.env["STUB_FAIL_TURN"] === "1"
const staleTurn = process.env["STUB_STALE_TURN"] === "1"

const log = (entry: object) => appendFileSync(record, JSON.stringify(entry) + "\n")
const lines = readFileSync(new URL(`fixtures/${name}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean)
const isResult = (line: string) => JSON.parse(line).type === "result"
const isControl = (line: string) => JSON.parse(line).type === "control_response"

const turns: string[][] = []
let current: string[] = []
for (const line of lines) {
  current.push(line)
  if (isResult(line)) {
    turns.push(current)
    current = []
  }
}

const split = turns[0]?.findIndex(isControl) ?? -1
let tail: string[] = []
let turn = 0

const emit = (batch: string[]) => {
  for (const line of batch) process.stdout.write(line + "\n")
}

log({ type: "start", pid: process.pid, argv: process.argv.slice(2), configDir: process.env["CLAUDE_CONFIG_DIR"] ?? null, runAsNode: process.env["ELECTRON_RUN_AS_NODE"] ?? null, cwd: process.cwd() })

process.on("SIGINT", () => {
  emit(tail)
  process.exit(0)
})

const reader = createInterface({ input: process.stdin })
reader.on("line", (line) => {
  log({ type: "stdin", line })
  const message = JSON.parse(line)
  if (message.type === "user") {
    if (failTurn) {
      process.exit(3)
    }
    if (staleTurn && turn === 0) {
      emit([
        JSON.stringify({ type: "system", subtype: "task_notification", summary: "background command stopped" }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "STALE" }] } }),
        JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "" }),
      ])
    }
    emit([JSON.stringify({ type: "user", uuid: message.uuid, message: message.message })])
    const next = turns[turn % turns.length] ?? []
    turn += 1
    if (split === -1) {
      emit(next)
      return
    }
    emit(next.slice(0, split))
    tail = next.slice(split + 1)
    return
  }
  if (message.type === "control_request" && !ignoreInterrupt) {
    emit([lines[split] ?? ""])
    emit(tail)
    tail = []
  }
})
reader.on("close", () => process.exit(0))
