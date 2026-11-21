import type { BrokerState } from "@/spaces/types"
import { modelTagKind, type ModelTagKind } from "@/components/agents/model-tag"
import type { ModelRef } from "@/components/agents/agents-diagram-model"

export type OverviewDockRequest = { agent: string; model: ModelRef; text: string; directory: string }

export function overviewDockRequest(input: {
  text: string
  agent: string
  model: ModelRef | undefined
  directory: string | undefined
}): OverviewDockRequest | undefined {
  const text = input.text.trim()
  if (!text || !input.model || !input.directory) return undefined
  return { agent: input.agent, model: input.model, text, directory: input.directory }
}

export type OverviewSubtitlePart =
  | { key: "core"; version: string }
  | { key: "agents"; count: number }
  | { key: "broker"; count: number }

export function overviewSubtitle(input: { version: string | undefined; agents: number; broker: boolean }) {
  const parts: OverviewSubtitlePart[] = []
  if (input.version) parts.push({ key: "core", version: input.version.replace(/^v/, "") })
  parts.push({ key: "agents", count: input.agents })
  if (input.broker) parts.push({ key: "broker", count: 1 })
  return parts
}

export type OverviewTelemetryItem =
  | { key: "broker"; state: BrokerState }
  | { key: "hub"; connected: number; configured: number }
  | { key: "sessions"; count: number }
  | { key: "agents"; count: number }

export function overviewTelemetry(input: {
  broker: BrokerState | undefined
  hub: { configured: number; connected: number }
  sessions: number
  agents: number
}) {
  const left: OverviewTelemetryItem[] = []
  if (input.broker) left.push({ key: "broker", state: input.broker })
  if (input.hub.configured > 0) left.push({ key: "hub", connected: input.hub.connected, configured: input.hub.configured })
  const right: OverviewTelemetryItem[] = [
    { key: "sessions", count: input.sessions },
    { key: "agents", count: input.agents },
  ]
  return { left, right }
}

export function overviewTagKind(model: ModelRef | undefined): ModelTagKind | "haiku" {
  const kind = modelTagKind(model)
  if (kind === "other" && model?.modelID.toLowerCase().includes("haiku")) return "haiku"
  return kind
}
