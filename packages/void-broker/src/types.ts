export type Usage = Record<string, number>

export type WorkerEvent =
  | { type: "event"; kind: string; text: string }
  | { type: "result"; stopReason: string; text: string; usage: Usage }

export type WorkerHealth = { ok: boolean; detail: string }

export interface WorkerLink {
  start(): Promise<void>
  prompt(text: string): AsyncIterable<WorkerEvent>
  cancel(): Promise<void>
  setOption(key: string, value: string): Promise<void>
  close(): Promise<void>
  health(): Promise<WorkerHealth>
}
