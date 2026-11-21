export type Usage = Record<string, number>

export type WorkerTiming = { stdinAt?: number; binaryFirstAt?: number }

export type WorkerEvent =
  | { type: "event"; kind: string; text: string }
  | { type: "result"; stopReason: string; text: string; usage: Usage; sessionId?: string; timing?: WorkerTiming }

export type WorkerHealth = { ok: boolean; detail: string }

export type StartOptions = { resumeSessionId?: string; fresh?: boolean }

export interface WorkerLink {
  start(options?: StartOptions): Promise<void>
  prompt(text: string): AsyncIterable<WorkerEvent>
  cancel(): Promise<void>
  setOption(key: string, value: string): Promise<void>
  close(): Promise<void>
  health(): Promise<WorkerHealth>
}
