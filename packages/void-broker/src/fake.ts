import type { WorkerEvent, WorkerLink } from "./types"

export type FakeOptions = { chunks?: string[]; delayMs?: number; sessionId?: string }

export function createFakeWorker(options: FakeOptions = {}): WorkerLink {
  const chunks = options.chunks ?? ["fake ", "reply"]
  const delayMs = options.delayMs ?? 0
  const settings = new Map<string, string>()
  let started = false
  let cancelled = false
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
    let out = ""
    try {
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
        sessionId: options.sessionId ?? "fake-session",
      }
    } finally {
      cancelled = false
      wake = undefined
    }
  }

  return {
    async start() {
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
