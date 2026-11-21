import type { EdgeRecord, NodeRecord, Props } from "./types"

export interface NodeRow {
  id: string
  kind: string
  project: string | null
  scope: string
  title: string | null
  body: string | null
  props: string
  created_by: string | null
  session_id: string | null
  created_at: number
  updated_at: number
  invalidated_at: number | null
  superseded_by: string | null
}

export interface EdgeRow {
  src: string
  dst: string
  type: string
  props: string
  created_at: number
  invalidated_at: number | null
}

const isRecord = (value: unknown): value is Props => typeof value === "object" && value !== null && !Array.isArray(value)

export const parseProps = (text: string): Props => {
  const value: unknown = JSON.parse(text)
  return isRecord(value) ? value : {}
}

export const toNode = (row: NodeRow): NodeRecord => ({ ...row, props: parseProps(row.props) })

export const toEdge = (row: EdgeRow): EdgeRecord => ({ ...row, props: parseProps(row.props) })
