export type ProviderConnectStep = "provider" | "credentials"

export type ProviderConnectStepStatus = "done" | "active" | "todo"

export const providerConnectSteps: ProviderConnectStep[] = ["provider", "credentials"]

export const providerConnectStep = (selected: string | undefined): ProviderConnectStep =>
  selected ? "credentials" : "provider"

export function providerConnectStatus(
  current: ProviderConnectStep,
  step: ProviderConnectStep,
): ProviderConnectStepStatus {
  const a = providerConnectSteps.indexOf(step)
  const b = providerConnectSteps.indexOf(current)
  if (a < b) return "done"
  if (a === b) return "active"
  return "todo"
}
