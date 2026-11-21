import { describe, expect, test } from "bun:test"
import { dict } from "@/i18n/en"
import { modelNote, providerNote } from "./provider-notes"

describe("provider notes", () => {
  test("the subscription provider explains itself in settings and in its model info", () => {
    expect(providerNote("subscription")).toBe("dialog.provider.subscription.note")
    expect(modelNote("subscription")).toBe("dialog.provider.subscription.note")
    expect(dict["dialog.provider.subscription.note"]).toContain("official claude CLI")
    expect(dict["dialog.provider.subscription.note"]).toContain("No per-token billing")
  })

  test("existing provider notes stay in settings only", () => {
    expect(providerNote("anthropic")).toBe("dialog.provider.anthropic.note")
    expect(providerNote("github-copilot-enterprise")).toBe("dialog.provider.copilot.note")
    expect(providerNote("unknown")).toBeUndefined()
    expect(modelNote("openai")).toBeUndefined()
  })
})
