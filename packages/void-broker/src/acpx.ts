import { createAcpRuntime, createAgentRegistry, createFileSessionStore } from "acpx/runtime"
import type { AcpRuntimeEvent, AcpRuntimeHandle } from "acpx/runtime"
import type { McpServer } from "@agentclientprotocol/sdk"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import type { StartOptions, Usage, WorkerEvent, WorkerHealth, WorkerLink, WorkerTiming } from "./types"
import type { WorkerEntry } from "./workers"

const timingShape = z.object({ stdinAt: z.number(), binaryFirstAt: z.number() })

const shimMain = path.join(path.dirname(fileURLToPath(import.meta.url)), "shim/main.ts")

export type AcpxLinkOptions = {
  entry: WorkerEntry
  stateDir: string
  cwd: string
  mcpServers: McpServer[]
  shimArgs?: string[]
  env?: Record<string, string>
  closeTimeoutMs?: number
}

export function shimArgv(entry: WorkerEntry, extra: string[] = []) {
  const argv = [process.execPath, shimMain]
  if (entry.model) argv.push("--model", entry.model)
  if (entry.effort) argv.push("--effort", entry.effort)
  if (entry.mode) argv.push("--permission-mode", entry.mode)
  if (entry.account) argv.push("--config-dir", entry.account)
  if (entry.settingSources !== undefined) argv.push("--setting-sources", entry.settingSources)
  return [...argv, ...extra]
}

const eventOf = (event: AcpRuntimeEvent): WorkerEvent | undefined => {
  if (event.type === "text_delta") return { type: "event", kind: event.tag ?? "text_delta", text: event.text }
  if (event.type === "tool_call") return { type: "event", kind: event.tag ?? "tool_call", text: event.title ?? event.text }
  return undefined
}

const timingOf = (meta: Record<string, unknown> | null | undefined): WorkerTiming | undefined => {
  const parsed = timingShape.safeParse(meta?.["voidTiming"])
  return parsed.success ? parsed.data : undefined
}

const alive = (pid: number) => {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export class AcpxWorkerLink implements WorkerLink {
  private runtime: ReturnType<typeof createAcpRuntime> | undefined
  private handle: AcpRuntimeHandle | undefined
  private pid = 0

  constructor(private readonly options: AcpxLinkOptions) {}

  info() {
    return { pid: this.pid, sessionId: this.handle?.agentSessionId ?? this.handle?.backendSessionId ?? "" }
  }

  async start(options: StartOptions = {}) {
    if (this.handle) return
    const { entry, stateDir, cwd } = this.options
    await mkdir(stateDir, { recursive: true })
    const runtime = createAcpRuntime({
      cwd,
      sessionStore: createFileSessionStore({ stateDir }),
      agentRegistry: createAgentRegistry({ overrides: { [entry.id]: shimArgv(entry, this.options.shimArgs) } }),
      permissionMode: "approve-all",
      mcpServers: this.options.mcpServers,
      agentProcessEnv: this.options.env,
      processLifecycle: {
        onSpawned: (started) => {
          this.pid = started.pid
        },
      },
    })
    try {
      if (options.fresh) {
        const existing = await runtime.findSession?.({ sessionKey: entry.id, agent: entry.id })
        if (existing) await runtime.prepareFreshSession?.({ handle: existing })
      }
      this.handle = await runtime.ensureSession({
        sessionKey: entry.id,
        agent: entry.id,
        mode: "persistent",
        cwd,
        resumeSessionId: options.fresh ? undefined : options.resumeSessionId,
      })
    } catch (error) {
      await runtime.shutdown?.()
      throw error
    }
    this.runtime = runtime
  }

  async *prompt(text: string): AsyncGenerator<WorkerEvent> {
    const { runtime, handle } = this
    if (!runtime || !handle) throw new Error("worker not started")
    const turn = runtime.startTurn({ handle, requestId: randomUUID(), mode: "prompt", text })
    let out = ""
    const usage: Usage = {}
    for await (const event of turn.events) {
      if (event.type === "text_delta" && event.stream !== "thought") out += event.text
      if (event.type === "status" && event.breakdown) {
        for (const [key, value] of Object.entries(event.breakdown)) if (typeof value === "number") usage[key] = value
      }
      const mapped = eventOf(event)
      if (mapped) yield mapped
    }
    const result = await turn.result
    if (result.status === "failed") throw new Error(result.error.message)
    yield {
      type: "result",
      stopReason: result.stopReason ?? (result.status === "cancelled" ? "cancelled" : "end_turn"),
      text: out,
      usage,
      sessionId: this.info().sessionId,
      timing: timingOf(result._meta),
    }
  }

  async cancel() {
    if (this.runtime && this.handle) await this.runtime.cancel({ handle: this.handle })
  }

  async setOption(key: string, value: string) {
    if (!this.runtime || !this.handle) throw new Error("worker not started")
    await this.runtime.setConfigOption?.({ handle: this.handle, key, value })
  }

  async close() {
    const runtime = this.runtime
    this.runtime = undefined
    this.handle = undefined
    const pid = this.pid
    this.pid = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.options.closeTimeoutMs ?? 3000)
    })
    await Promise.race([runtime?.shutdown?.().catch(() => undefined), limit])
    clearTimeout(timer)
    if (runtime && alive(pid)) process.kill(pid, "SIGKILL")
  }

  async health(): Promise<WorkerHealth> {
    return this.handle ? { ok: true, detail: "running" } : { ok: false, detail: "stopped" }
  }
}
