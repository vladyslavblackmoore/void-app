import { describe, expect, test } from "bun:test"
import { modelChipLabel, modelTagKind, modelTagLabel } from "./model-tag"

describe("modelTagKind", () => {
  test("maps model ids to tag kinds", () => {
    expect(modelTagKind({ providerID: "sub", modelID: "opus-4-1" })).toBe("opus")
    expect(modelTagKind({ providerID: "sub", modelID: "Sonnet-5" })).toBe("sonnet")
    expect(modelTagKind({ providerID: "api", modelID: "gpt-5-mini" })).toBe("gpt5")
  })

  test("maps local runtimes", () => {
    expect(modelTagKind({ providerID: "ollama", modelID: "qwen3" })).toBe("local")
    expect(modelTagKind({ providerID: "lmstudio", modelID: "anything" })).toBe("local")
    expect(modelTagKind({ providerID: "x", modelID: "local-qwen" })).toBe("local")
  })

  test("falls back to other and handles a missing model", () => {
    expect(modelTagKind({ providerID: "x", modelID: "mystery" })).toBe("other")
    expect(modelTagKind(undefined)).toBe("other")
  })
})

describe("modelTagLabel", () => {
  test("returns the model id", () => {
    expect(modelTagLabel({ providerID: "sub", modelID: "opus" })).toBe("opus")
    expect(modelTagLabel(undefined)).toBeUndefined()
  })
})

describe("modelChipLabel", () => {
  test("shows the model name without the provider", () => {
    expect(modelChipLabel({ providerID: "subscription", modelID: "opus" })).toBe("opus")
    expect(modelChipLabel(undefined)).toBeUndefined()
  })
})
