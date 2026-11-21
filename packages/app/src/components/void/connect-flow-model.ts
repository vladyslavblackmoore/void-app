import type { TileState } from "./connector-model"

export type FlowStep = "authorize" | "account" | "access" | "done"

export type AuthorizeMode = "authorize" | "connect" | "ready" | "unavailable"

export type StepStatus = "done" | "active" | "todo"

export const flowSteps: FlowStep[] = ["authorize", "account", "access", "done"]

const placeholders: FlowStep[] = ["account", "access"]

export const isPlaceholder = (step: FlowStep) => placeholders.includes(step)

export const initialStep = (state: TileState): FlowStep => (state === "connected" ? "account" : "authorize")

export function canAdvance(step: FlowStep, ctx: { authorized: boolean }) {
  if (step === "done") return false
  if (step === "authorize") return ctx.authorized
  return true
}

export function nextStep(step: FlowStep, ctx: { authorized: boolean }): FlowStep {
  if (!canAdvance(step, ctx)) return step
  return flowSteps[flowSteps.indexOf(step) + 1] ?? step
}

export function prevStep(step: FlowStep): FlowStep {
  return flowSteps[Math.max(flowSteps.indexOf(step) - 1, 0)] ?? step
}

export function stepStatus(current: FlowStep, step: FlowStep): StepStatus {
  const a = flowSteps.indexOf(step)
  const b = flowSteps.indexOf(current)
  if (a < b) return "done"
  if (a === b) return "active"
  return "todo"
}

export function authorizeMode(state: TileState): AuthorizeMode {
  if (state === "needs_auth") return "authorize"
  if (state === "connected") return "ready"
  if (state === "available") return "unavailable"
  return "connect"
}
