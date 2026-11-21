import { randomUUID } from "node:crypto"
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
  createLink: (entry: WorkerEntry) => WorkerLink
}

type Active = { workerId: string; link: WorkerLink }

export function createBroker(options: BrokerOptions) {
  const entries = new Map(options.config.workers.map((entry) => [entry.id, entry]))
  const links = new Map<string, WorkerLink>()
  const started = new Set<string>()
  const active = new Map<string, Active>()

  const busy = (workerId: string) => [...active.values()].some((run) => run.workerId === workerId)

  async function ensureStarted(workerId: string, link: WorkerLink) {
    if (started.has(workerId)) return
    try {
      await link.start()
    } catch (error) {
      links.delete(workerId)
      throw error
    }
    started.add(workerId)
  }

  async function execute(
    runId: string,
    workerId: string,
    link: WorkerLink,
    text: string,
    fresh: boolean,
    sink: RunSink,
  ) {
    let finished = false
    try {
      if (fresh && started.has(workerId)) {
        await link.close()
        started.delete(workerId)
      }
      await ensureStarted(workerId, link)
      for await (const event of link.prompt(text)) {
        if (event.type === "event") sink.event(runId, event.kind, event.text)
        else {
          finished = true
          sink.result(runId, event.stopReason, event.text, event.usage, event.sessionId)
        }
      }
      if (!finished) sink.result(runId, "error", "worker ended without a result", {})
    } catch (error) {
      if (!finished) sink.result(runId, "error", error instanceof Error ? error.message : String(error), {})
    } finally {
      active.delete(runId)
    }
  }

  return {
    workers() {
      return [...entries.values()].map((entry) => ({
        id: entry.id,
        backend: entry.backend,
        model: entry.model ?? null,
        effort: entry.effort ?? null,
        description: entry.description,
        warm: entry.warm,
        running: started.has(entry.id),
        busy: busy(entry.id),
      }))
    },
    health() {
      return {
        ok: true,
        workers: entries.size,
        runningWorkers: started.size,
        activeRuns: active.size,
        maxActive: options.config.maxActive,
      }
    },
    startRun(params: StartParams, sink: RunSink) {
      const entry = entries.get(params.worker)
      if (!entry) throw new BrokerError(errorCodes.unknownWorker, `unknown worker: ${params.worker}`)
      if (busy(entry.id)) throw new BrokerError(errorCodes.busy, `worker busy: ${entry.id}`)
      let link = links.get(entry.id)
      if (!link) {
        link = options.createLink(entry)
        links.set(entry.id, link)
      }
      const runId = randomUUID()
      active.set(runId, { workerId: entry.id, link })
      const text = params.taskId ? `Board task id: ${params.taskId}\n${params.prompt}` : params.prompt
      void execute(runId, entry.id, link, text, params.fresh === true, sink)
      return runId
    },
    async cancelRun(runId: string) {
      const run = active.get(runId)
      if (!run) throw new BrokerError(errorCodes.unknownRun, `unknown run: ${runId}`)
      await run.link.cancel()
    },
    async close() {
      await Promise.allSettled([...active.values()].map((run) => run.link.cancel()))
      await Promise.allSettled([...links.values()].map((link) => link.close()))
      links.clear()
      started.clear()
    },
  }
}

export type Broker = ReturnType<typeof createBroker>
