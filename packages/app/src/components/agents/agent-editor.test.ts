import { describe, expect, test } from "bun:test"
import {
  buildAgentPatch,
  groupModels,
  hasRunningSessions,
  initialDraft,
  selectModel,
  variantsFor,
} from "./agent-editor"

const providers: Parameters<typeof groupModels>[0] = [
  {
    id: "subscription",
    name: "Subscription",
    models: {
      opus: { id: "opus", name: "Opus", variants: { low: {}, high: {} } },
      haiku: { id: "haiku", name: "Haiku" },
    },
  },
  {
    id: "api",
    name: "API Provider",
    models: { big: { id: "big", name: "Big", variants: { high: {}, max: {} } } },
  },
]

describe("groupModels", () => {
  test("groups models by connected provider", () => {
    const groups = groupModels(providers)
    expect(groups.map((group) => group.id)).toEqual(["subscription", "api"])
    expect(groups[0]?.models.map((model) => model.ref)).toEqual(["subscription/opus", "subscription/haiku"])
    expect(groups[0]?.models[0]?.variants).toEqual(["low", "high"])
    expect(groups[0]?.models[1]?.variants).toEqual([])
  })

  test("drops providers without models", () => {
    expect(groupModels([{ id: "empty", name: "Empty", models: {} }])).toEqual([])
  })
})

describe("variantsFor", () => {
  test("lists the variants of the model", () => {
    expect(variantsFor(providers, { providerID: "subscription", modelID: "opus" })).toEqual(["low", "high"])
  })

  test("is empty without variants, without a model or for an unknown model", () => {
    expect(variantsFor(providers, { providerID: "subscription", modelID: "haiku" })).toEqual([])
    expect(variantsFor(providers, undefined)).toEqual([])
    expect(variantsFor(providers, { providerID: "x", modelID: "y" })).toEqual([])
  })
})

describe("initialDraft", () => {
  test("starts inheriting when a subagent has no model", () => {
    expect(initialDraft({ inherits: true })).toEqual({ inherit: true, model: undefined, variant: undefined })
  })

  test("copies the model and effort of the node", () => {
    const model = { providerID: "subscription", modelID: "opus" }
    expect(initialDraft({ inherits: false, model, variant: "high" })).toEqual({
      inherit: false,
      model,
      variant: "high",
    })
  })
})

describe("selectModel", () => {
  const draft = { inherit: false, model: { providerID: "subscription", modelID: "opus" }, variant: "high" }

  test("keeps the effort when the new model has it", () => {
    const next = selectModel(draft, { providerID: "api", modelID: "big" }, providers)
    expect(next.variant).toBe("high")
    expect(next.model).toEqual({ providerID: "api", modelID: "big" })
    expect(next.inherit).toBe(false)
  })

  test("drops the effort when the new model lacks it", () => {
    const next = selectModel(draft, { providerID: "subscription", modelID: "haiku" }, providers)
    expect(next.variant).toBeUndefined()
  })

  test("leaves inherit mode when a model is picked", () => {
    const next = selectModel({ inherit: true }, { providerID: "api", modelID: "big" }, providers)
    expect(next.inherit).toBe(false)
  })
})

describe("buildAgentPatch", () => {
  test("writes the model and effort in one patch", () => {
    const patch = buildAgentPatch("worker", {
      inherit: false,
      model: { providerID: "subscription", modelID: "opus" },
      variant: "high",
    })
    expect(patch).toEqual({ agent: { worker: { model: "subscription/opus", variant: "high" } } })
  })

  test("clears a stale effort with an empty string", () => {
    const patch = buildAgentPatch("worker", {
      inherit: false,
      model: { providerID: "subscription", modelID: "haiku" },
    })
    expect(patch).toEqual({ agent: { worker: { model: "subscription/haiku", variant: "" } } })
  })

  test("clears model and effort when inheriting", () => {
    const patch = buildAgentPatch("worker", {
      inherit: true,
      model: { providerID: "subscription", modelID: "opus" },
      variant: "high",
    })
    expect(patch).toEqual({ agent: { worker: { model: "", variant: "" } } })
  })

  test("is empty without a model when not inheriting", () => {
    expect(buildAgentPatch("main", { inherit: false })).toEqual({ agent: { main: { model: "", variant: "" } } })
  })
})

describe("hasRunningSessions", () => {
  test("is false when every session is idle or none exist", () => {
    expect(hasRunningSessions({})).toBe(false)
    expect(hasRunningSessions({ a: { type: "idle" } })).toBe(false)
  })

  test("is true when a session is busy or retrying", () => {
    expect(hasRunningSessions({ a: { type: "idle" }, b: { type: "busy" } })).toBe(true)
    expect(hasRunningSessions({ a: { type: "retry" } })).toBe(true)
  })

  test("ignores undefined entries", () => {
    expect(hasRunningSessions({ a: undefined })).toBe(false)
  })
})
