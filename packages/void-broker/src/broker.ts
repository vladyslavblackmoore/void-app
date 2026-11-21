import { randomUUID } from "node:crypto"
import path from "node:path"
import { openRunLog, type RunRecord } from "./runlog"
import { openSessions, type SessionStore } from "./sessions"
import type { Usage, WorkerLink } from "./types"
import type { WorkerEntry, WorkersConfig } from "./workers"

export const errorCodes = {
  unknownWorker: -32001,
  busy: -32002,
  unknownRun: -32003,
} as const

export class BrokerError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export type RunSink = {
  event: (runId: string, kind: string, text: string) => void
  result: (runId: string, stopReason: string, text: string, usage: Usage, sessionId?: string) => void
}

export type StartParams = { worker: string; prompt: string; taskId?: string; fresh?: boolean }

export type BrokerOptions = {
  config: WorkersConfig
  stateDir: string
  createLink: (entry: WorkerEntry) => WorkerLink
  closeTimeoutMs?: number
}

type Run = {
  id: string
  seq: number
  text: string
  taskId: string | null
  fresh: boolean
  sink: RunSink
  queuedAt: number
  startedAt: number
  firstEventAt: number | null
  cancelled: boolean
}

type Slot = {
  entry: WorkerEntry
  link: WorkerLink
  started: boolean
  starting: Promise<void> | undefined
  running: Run | undefined
  queue: Run[]
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function createBroker(options: BrokerOptions) {
  const queueDepth = options.config.queueDepth
  const maxActive = options.config.maxActive
  const closeTimeoutMs = options.closeTimeoutMs ?? 5000
  const sessions: SessionStore = await openSessions(path.join(options.stateDir, "sessions.json"))
  const runLog = openRunLog(path.join(options.stateDir, "log"))
  const entries = new Map(options.config.workers.map((entry) => [entry.id, entry]))
  const slots = new Map<string, Slot>()
  const runs = new Map<string, { slot: Slot; run: Run }>()
  let sequence = 0
  let closing = false

  const slotOf = (entry: WorkerEntry): Slot => {
    const existing = slots.get(entry.id)
    if (existing) return existing
    const slot: Slot = {
      entry,
      link: options.createLink(entry),
      started: false,
      starting: undefined,
      running: undefined,
      queue: [],
    }
    slots.set(entry.id, slot)
    return slot
  }

  const activeCount = () => [...slots.values()].filter((slot) => slot.running).length
  const queuedCount = () => [...slots.values()].reduce((sum, slot) => sum + slot.queue.length, 0)

  async function ensureStarted(slot: Slot, fresh: boolean) {
    if (slot.started) return
    if (!slot.starting) {
      const resumeSessionId = fresh ? undefined : sessions.get(slot.entry.id)
      slot.starting = slot.link
        .start({ resumeSessionId, fresh })
        .then(() => {
          slot.started = true
        })
        .finally(() => {
          slot.starting = undefined
        })
    }
    await slot.starting
  }

  async function restart(slot: Slot) {
    slot.started = false
    await closeLink(slot.link)
    if (closing) return
    await ensureStarted(slot, false).catch(() => undefined)
  }

  async function closeLink(link: WorkerLink) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, closeTimeoutMs)
    })
    await Promise.race([link.close().catch(() => undefined), limit])
    clearTimeout(timer)
  }

  async function execute(slot: Slot, run: Run) {
    run.startedAt = Date.now()
    let sessionId = sessions.get(slot.entry.id) ?? ""
    let stopReason = "error"
    let error: string | null = null
    let timing: { stdinAt?: number; binaryFirstAt?: number } | undefined
    let crashed = false
    try {
      if (run.fresh && slot.started) {
        slot.started = false
        await closeLink(slot.link)
      }
      if (run.fresh) await sessions.delete(slot.entry.id)
      await ensureStarted(slot, run.fresh)
      if (run.cancelled) {
        stopReason = "cancelled"
        run.sink.result(run.id, "cancelled", "", {}, sessionId)
        return
      }
      let finished = false
      for await (const event of slot.link.prompt(run.text)) {
        if (event.type === "event") {
          run.firstEventAt ??= Date.now()
          run.sink.event(run.id, event.kind, event.text)
          continue
        }
        finished = true
        stopReason = event.stopReason
        timing = event.timing
        if (event.sessionId) {
          sessionId = event.sessionId
          await sessions.set(slot.entry.id, sessionId)
        }
        run.sink.result(run.id, event.stopReason, event.text, event.usage, sessionId)
      }
      if (!finished) {
        crashed = true
        error = "worker ended without a result"
        run.sink.result(run.id, "error", error, {}, sessionId)
      }
    } catch (caught) {
      crashed = true
      error = errorText(caught)
      run.sink.result(run.id, "error", error, {}, sessionId)
    } finally {
      const record: RunRecord = {
        runId: run.id,
        worker: slot.entry.id,
        sessionId,
        taskId: run.taskId,
        queuedAt: run.queuedAt,
        startedAt: run.startedAt,
        firstEventAt: run.firstEventAt,
        resultAt: Date.now(),
        stopReason,
        error,
        stdinAt: timing?.stdinAt ?? null,
        binaryFirstAt: timing?.binaryFirstAt ?? null,
      }
      void runLog.append(record).catch(() => undefined)
      if (crashed) await restart(slot)
      runs.delete(run.id)
      slot.running = undefined
      pump()
    }
  }

  function pump() {
    if (closing) return
    const ready = [...slots.values()]
      .filter((slot) => !slot.running && slot.queue.length > 0)
      .sort((a, b) => (a.queue[0]?.seq ?? 0) - (b.queue[0]?.seq ?? 0))
    for (const slot of ready) {
      if (activeCount() >= maxActive) return
      const run = slot.queue.shift()
      if (!run) continue
      slot.running = run
      void execute(slot, run)
    }
  }

  return {
    workers() {
      return [...entries.values()].map((entry) => {
        const slot = slots.get(entry.id)
        return {
          id: entry.id,
          backend: entry.backend,
          model: entry.model ?? null,
          effort: entry.effort ?? null,
          description: entry.description,
          warm: entry.warm,
          running: slot?.started ?? false,
          busy: slot?.running !== undefined,
          queued: slot?.queue.length ?? 0,
        }
      })
    },
    health() {
      return {
        ok: true,
        workers: entries.size,
        runningWorkers: [...slots.values()].filter((slot) => slot.started).length,
        activeRuns: activeCount(),
        queuedRuns: queuedCount(),
        maxActive,
        queueDepth,
      }
    },
    async warm() {
      await Promise.allSettled(
        [...entries.values()].filter((entry) => entry.warm).map((entry) => ensureStarted(slotOf(entry), false)),
      )
    },
    startRun(params: StartParams, sink: RunSink) {
      const entry = entries.get(params.worker)
      if (!entry) throw new BrokerError(errorCodes.unknownWorker, `unknown worker: ${params.worker}`)
      if (closing) throw new BrokerError(errorCodes.busy, "broker is shutting down")
      const slot = slotOf(entry)
      const pending = slot.queue.length + (slot.running ? 1 : 0)
      if (pending > queueDepth) throw new BrokerError(errorCodes.busy, `worker busy: ${entry.id}`)
      const run: Run = {
        id: randomUUID(),
        seq: ++sequence,
        text: params.taskId ? `Board task id: ${params.taskId}\n${params.prompt}` : params.prompt,
        taskId: params.taskId ?? null,
        fresh: params.fresh === true,
        sink,
        queuedAt: Date.now(),
        startedAt: 0,
        firstEventAt: null,
        cancelled: false,
      }
      runs.set(run.id, { slot, run })
      slot.queue.push(run)
      pump()
      return run.id
    },
    async cancelRun(runId: string) {
      const found = runs.get(runId)
      if (!found) throw new BrokerError(errorCodes.unknownRun, `unknown run: ${runId}`)
      const { slot, run } = found
      const index = slot.queue.indexOf(run)
      if (index !== -1) {
        slot.queue.splice(index, 1)
        runs.delete(run.id)
        const now = Date.now()
        run.sink.result(run.id, "cancelled", "", {}, sessions.get(slot.entry.id))
        void runLog
          .append({
            runId: run.id,
            worker: slot.entry.id,
            sessionId: sessions.get(slot.entry.id) ?? "",
            taskId: run.taskId,
            queuedAt: run.queuedAt,
            startedAt: now,
            firstEventAt: null,
            resultAt: now,
            stopReason: "cancelled",
            error: null,
            stdinAt: null,
            binaryFirstAt: null,
          })
          .catch(() => undefined)
        return
      }
      run.cancelled = true
      await slot.link.cancel()
    },
    async close() {
      closing = true
      for (const slot of slots.values()) {
        for (const run of slot.queue.splice(0)) {
          runs.delete(run.id)
          run.sink.result(run.id, "cancelled", "", {}, undefined)
        }
      }
      await Promise.allSettled([...slots.values()].filter((slot) => slot.running).map((slot) => slot.link.cancel()))
      await Promise.allSettled([...slots.values()].map((slot) => closeLink(slot.link)))
      await runLog.flush()
      slots.clear()
    },
  }
}

export type Broker = Awaited<ReturnType<typeof createBroker>>
