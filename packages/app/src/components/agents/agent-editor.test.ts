import { describe, expect, test } from "bun:test"
import {
  buildAgentPatch,
  canSave,
  effortControl,
  fileFields,
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

describe("fileFields", () => {
  const model = { providerID: "subscription", modelID: "opus" }

  test("flags a field the agent has but the global config does not", () => {
    expect(fileFields({ model, variant: "high" }, undefined)).toEqual({ model: true, variant: true })
    expect(fileFields({ model, variant: "high" }, { model: "subscription/sonnet", variant: "low" })).toEqual({
      model: true,
      variant: true,
    })
  })

  test("does not flag a field that matches the global config", () => {
    expect(fileFields({ model, variant: "high" }, { model: "subscription/opus", variant: "high" })).toEqual({
      model: false,
      variant: false,
    })
  })

  test("flags each field on its own", () => {
    expect(fileFields({ model, variant: "high" }, { model: "subscription/opus" })).toEqual({
      model: false,
      variant: true,
    })
  })

  test("flags nothing for an agent without model and variant", () => {
    expect(fileFields({}, { model: "subscription/opus", variant: "high" })).toEqual({ model: false, variant: false })
    expect(fileFields(undefined, undefined)).toEqual({ model: false, variant: false })
    expect(fileFields({ variant: "" }, { variant: "" })).toEqual({ model: false, variant: false })
  })
})

describe("locked fields in the patch", () => {
  const draft = { inherit: false, model: { providerID: "api", modelID: "big" }, variant: "max" }

  test("leaves out the fields set in the agent file", () => {
    expect(buildAgentPatch("doc", draft, { model: true, variant: false })).toEqual({
      agent: { doc: { variant: "max" } },
    })
    expect(buildAgentPatch("doc", draft, { model: false, variant: true })).toEqual({
      agent: { doc: { model: "api/big" } },
    })
  })

  test("can save unless both fields are locked", () => {
    expect(canSave({ model: true, variant: false })).toBe(true)
    expect(canSave({ model: false, variant: false })).toBe(true)
    expect(canSave({ model: true, variant: true })).toBe(false)
  })
})

describe("effortControl", () => {
  test("uses the segmented control only under the void theme", () => {
    expect(effortControl("void")).toBe("segmented")
    expect(effortControl("oc-2")).toBe("chips")
    expect(effortControl("")).toBe("chips")
    expect(effortControl(undefined)).toBe("chips")
  })
})
