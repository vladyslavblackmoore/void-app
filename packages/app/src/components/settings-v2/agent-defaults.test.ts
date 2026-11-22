import { describe, expect, test } from "bun:test"
import {
  agentDefault,
  agentDefaultPatch,
  anyRunning,
  childAgentName,
  formatModelRef,
  mergePatches,
  mainAgentName,
  parseModelRef,
  sameDefault,
  variantNames,
} from "./agent-defaults"

describe("mainAgentName", () => {
  test("uses the configured default agent and falls back to build", () => {
    expect(mainAgentName({ default_agent: "main" })).toBe("main")
    expect(mainAgentName({})).toBe("build")
    expect(mainAgentName(undefined)).toBe("build")
    expect(mainAgentName({ default_agent: "  " })).toBe("build")
  })
})

describe("model refs", () => {
  test("parses provider/model and keeps slashes inside the model id", () => {
    expect(parseModelRef("openai/gpt-5.6-sol")).toEqual({ providerID: "openai", modelID: "gpt-5.6-sol" })
    expect(parseModelRef("openrouter/anthropic/x")).toEqual({ providerID: "openrouter", modelID: "anthropic/x" })
  })

  test("rejects values that are not provider/model", () => {
    expect(parseModelRef(undefined)).toBeUndefined()
    expect(parseModelRef("")).toBeUndefined()
    expect(parseModelRef("sonnet")).toBeUndefined()
    expect(parseModelRef("/x")).toBeUndefined()
    expect(parseModelRef("x/")).toBeUndefined()
  })

  test("formats a model reference", () => {
    expect(formatModelRef({ providerID: "subscription", modelID: "opus" })).toBe("subscription/opus")
  })
})

describe("agentDefault", () => {
  test("reads model and variant of an agent from the config", () => {
    const config = { agent: { worker: { model: "subscription/sonnet", variant: "high" } } }
    expect(agentDefault(config, "worker")).toEqual({
      model: { providerID: "subscription", modelID: "sonnet" },
      variant: "high",
    })
  })

  test("treats an empty variant as unset and a missing model as no default", () => {
    expect(agentDefault({ agent: { build: { model: "a/b", variant: "" } } }, "build")).toEqual({
      model: { providerID: "a", modelID: "b" },
      variant: undefined,
    })
    expect(agentDefault({ agent: { build: { variant: "high" } } }, "build")).toBeUndefined()
    expect(agentDefault({}, "build")).toBeUndefined()
  })
})

describe("agentDefaultPatch", () => {
  test("writes model and variant for main without touching the mode", () => {
    expect(agentDefaultPatch("build", { providerID: "openai", modelID: "gpt-5.6-sol" }, "high", false)).toEqual({
      agent: { build: { model: "openai/gpt-5.6-sol", variant: "high" } },
    })
  })

  test("writes an empty variant to clear it", () => {
    expect(agentDefaultPatch("main", { providerID: "a", modelID: "b" }, undefined, false)).toEqual({
      agent: { main: { model: "a/b", variant: "" } },
    })
  })

  test("marks the children agent as a subagent", () => {
    expect(agentDefaultPatch(childAgentName, { providerID: "a", modelID: "b" }, "low", true)).toEqual({
      agent: { worker: { model: "a/b", variant: "low", mode: "subagent" } },
    })
  })
})

describe("variantNames", () => {
  test("lists variant keys and tolerates a missing map", () => {
    expect(variantNames({ low: {}, high: {} })).toEqual(["low", "high"])
    expect(variantNames(undefined)).toEqual([])
  })
})

describe("anyRunning", () => {
  test("is true when any session is not idle", () => {
    expect(anyRunning({ a: { type: "idle" }, b: { type: "busy" } })).toBe(true)
    expect(anyRunning({ a: { type: "retry" } })).toBe(true)
    expect(anyRunning({ a: { type: "idle" } })).toBe(false)
    expect(anyRunning({})).toBe(false)
  })
})

describe("mergePatches", () => {
  test("keeps both agents and lets the later patch win for the same agent", () => {
    const main = agentDefaultPatch("build", { providerID: "a", modelID: "b" }, undefined, false)
    const children = agentDefaultPatch("worker", { providerID: "a", modelID: "c" }, "low", true)
    const later = agentDefaultPatch("build", { providerID: "a", modelID: "d" }, "high", false)
    expect(mergePatches([main, children, later])).toEqual({
      agent: {
        build: { model: "a/d", variant: "high" },
        worker: { model: "a/c", variant: "low", mode: "subagent" },
      },
    })
  })
})

describe("sameDefault", () => {
  test("compares model and variant, treating empty variants as equal", () => {
    const model = { providerID: "a", modelID: "b" }
    expect(sameDefault({ model, variant: undefined }, { model: { ...model }, variant: undefined })).toBe(true)
    expect(sameDefault({ model, variant: "high" }, { model, variant: undefined })).toBe(false)
    expect(sameDefault({ model, variant: undefined }, { model: { providerID: "a", modelID: "c" } })).toBe(false)
    expect(sameDefault(undefined, undefined)).toBe(true)
    expect(sameDefault(undefined, { model })).toBe(false)
  })
})
