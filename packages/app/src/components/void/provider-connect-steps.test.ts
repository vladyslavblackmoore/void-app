import { describe, expect, test } from "bun:test"
import { providerConnectStatus, providerConnectStep } from "./provider-connect-steps"

describe("provider connect steps", () => {
  test("the picker is the provider step and a selected provider is the credentials step", () => {
    expect(providerConnectStep(undefined)).toBe("provider")
    expect(providerConnectStep("anthropic")).toBe("credentials")
  })

  test("statuses follow the current step", () => {
    expect(providerConnectStatus("provider", "provider")).toBe("active")
    expect(providerConnectStatus("provider", "credentials")).toBe("todo")
    expect(providerConnectStatus("credentials", "provider")).toBe("done")
    expect(providerConnectStatus("credentials", "credentials")).toBe("active")
  })
})
