import { randomUUID } from "node:crypto"
import type { StartOptions, WorkerEvent, WorkerLink, WorkerTiming } from "./types"

export type FakeOptions = {
  chunks?: string[]
  delayMs?: number
  sessionId?: string
  crashOnPrompt?: number[]
  onStart?: (resumeSessionId: string | undefined) => void
  onPrompt?: () => void
  onDone?: () => void
  timing?: WorkerTiming
}

export function createFakeWorker(options: FakeOptions = {}): WorkerLink {
  const chunks = options.chunks ?? ["fake ", "reply"]
  const delayMs = options.delayMs ?? 0
  const settings = new Map<string, string>()
  let started = false
  let cancelled = false
  let sessionId = ""
  let prompts = 0
  let wake: (() => void) | undefined

  const pause = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })

  async function* prompt(text: string): AsyncGenerator<WorkerEvent> {
    if (!started) throw new Error("worker not started")
    prompts += 1
    options.onPrompt?.()
    let out = ""
    try {
      if (options.crashOnPrompt?.includes(prompts)) {
        started = false
        throw new Error("worker process exited")
      }
      for (const chunk of chunks) {
        await pause()
        if (cancelled) break
        out += chunk
        yield { type: "event", kind: "agent_message_chunk", text: chunk }
      }
      yield {
        type: "result",
        stopReason: cancelled ? "cancelled" : "end_turn",
        text: out,
        usage: { inputTokens: text.length, outputTokens: out.length },
        sessionId,
        timing: options.timing,
      }
    } finally {
      cancelled = false
      wake = undefined
      options.onDone?.()
    }
  }

  return {
    async start(start?: StartOptions) {
      options.onStart?.(start?.resumeSessionId)
      sessionId = start?.resumeSessionId ?? options.sessionId ?? `fake-${randomUUID()}`
      started = true
    },
    prompt,
    async cancel() {
      cancelled = true
      wake?.()
    },
    async setOption(key, value) {
      settings.set(key, value)
    },
    async close() {
      started = false
    },
    async health() {
      return started ? { ok: true, detail: "running" } : { ok: false, detail: "stopped" }
    },
  }
}
