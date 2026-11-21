export type Props = Record<string, unknown>

export interface Actor {
  readonly agent?: string
  readonly session?: string
}

export interface NodeInput {
  readonly ref?: string
  readonly id?: string
  readonly kind: string
  readonly title?: string
  readonly body?: string
  readonly project?: string
  readonly scope?: string
  readonly props?: Props
}

export interface EdgeInput {
  readonly src: string
  readonly dst: string
  readonly type: string
  readonly props?: Props
}

export interface NodeRecord {
  readonly id: string
  readonly kind: string
  readonly project: string | null
  readonly scope: string
  readonly title: string | null
  readonly body: string | null
  readonly props: Props
  readonly created_by: string | null
  readonly session_id: string | null
  readonly created_at: number
  readonly updated_at: number
  readonly invalidated_at: number | null
  readonly superseded_by: string | null
}

export interface EdgeRecord {
  readonly src: string
  readonly dst: string
  readonly type: string
  readonly props: Props
  readonly created_at: number
  readonly invalidated_at: number | null
}

export interface RememberInput {
  readonly nodes?: readonly NodeInput[]
  readonly edges?: readonly EdgeInput[]
}

export interface RememberResult {
  readonly nodes: readonly { readonly ref?: string; readonly id: string; readonly created: boolean }[]
  readonly edges: number
  readonly invalidated: readonly string[]
}

export interface RecallQuery {
  readonly query?: string
  readonly kinds?: readonly string[]
  readonly project?: string
  readonly agent?: string
  readonly hops?: number
  readonly limit?: number
  readonly history?: boolean
}

export interface RecallNode extends NodeRecord {
  readonly hop: number
  readonly score: number
  readonly snippet: string
}

export interface RecallResult {
  readonly nodes: readonly RecallNode[]
  readonly edges: readonly EdgeRecord[]
}

export interface OpenQuery {
  readonly ids: readonly string[]
  readonly agent?: string
  readonly history?: boolean
}

export interface OpenedNode {
  readonly node: NodeRecord
  readonly edges: readonly EdgeRecord[]
  readonly neighbours: readonly { readonly id: string; readonly kind: string; readonly title: string | null }[]
}

export interface ForgetInput {
  readonly ids: readonly string[]
  readonly superseded_by?: string
}

export interface ForgetResult {
  readonly invalidated: readonly string[]
  readonly missing: readonly string[]
  readonly already: readonly string[]
}

export const taskStatuses = ["open", "claimed", "in_progress", "blocked", "done", "failed", "cancelled"] as const

export type TaskStatus = (typeof taskStatuses)[number]

export interface TaskCreateInput {
  readonly id?: string
  readonly title: string
  readonly brief?: string
  readonly project?: string
  readonly deps?: readonly string[]
}

export interface TaskRecord {
  readonly id: string
  readonly title: string | null
  readonly brief: string | null
  readonly project: string | null
  readonly status: string
  readonly claimed_by: string | null
  readonly created_by: string | null
  readonly created_at: number
  readonly updated_at: number
  readonly deps: readonly string[]
}

export type ClaimResult =
  | { readonly claimed: true; readonly task: TaskRecord }
  | { readonly claimed: false; readonly reason: "not_found" | "not_open"; readonly status?: string; readonly claimed_by?: string | null }

export interface TaskUpdateInput {
  readonly id: string
  readonly status?: TaskStatus
  readonly note?: string
}

export interface TaskResultInput {
  readonly id: string
  readonly result: string
  readonly outcome?: "done" | "failed"
  readonly title?: string
}

export interface TaskListQuery {
  readonly status?: TaskStatus
  readonly project?: string
  readonly claimed_by?: string
  readonly ready?: boolean
  readonly limit?: number
}

export interface TaskEvent {
  readonly seq: number
  readonly task_id: string
  readonly actor: string | null
  readonly from_status: string | null
  readonly to_status: string | null
  readonly note: string | null
  readonly at: number
}

export interface BoardChanges {
  readonly events: readonly TaskEvent[]
  readonly cursor: number
}
