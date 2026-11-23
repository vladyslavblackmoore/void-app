import { describe, expect, test } from "bun:test"
import { pinnedModelKeys } from "./model-pinned"

describe("pinnedModelKeys", () => {
  test("collects provider:model keys of every agent with a model", () => {
    const keys = pinnedModelKeys({
      agent: {
        build: { model: "openai/gpt-5.6-sol" },
        worker: { model: "subscription/sonnet" },
        plan: {},
        broken: { model: "sonnet" },
      },
    })
    expect([...keys].sort()).toEqual(["openai:gpt-5.6-sol", "subscription:sonnet"])
  })

  test("is empty without agents", () => {
    expect(pinnedModelKeys(undefined).size).toBe(0)
    expect(pinnedModelKeys({}).size).toBe(0)
  })
})
