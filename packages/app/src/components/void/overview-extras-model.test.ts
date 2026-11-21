import { describe, expect, test } from "bun:test"
import { overviewDockRequest, overviewSubtitle, overviewTelemetry } from "./overview-extras-model"

const model = { providerID: "anthropic", modelID: "claude-haiku-4" }

describe("overview dock request", () => {
  test("needs text, a model and a directory", () => {
    expect(overviewDockRequest({ text: "  ", agent: "main", model, directory: "/p" })).toBeUndefined()
    expect(overviewDockRequest({ text: "hi", agent: "main", model: undefined, directory: "/p" })).toBeUndefined()
    expect(overviewDockRequest({ text: "hi", agent: "main", model, directory: undefined })).toBeUndefined()
  })

  test("targets the main agent with the trimmed text", () => {
    expect(overviewDockRequest({ text: " plan the release ", agent: "main", model, directory: "/p" })).toEqual({
      agent: "main",
      model,
      text: "plan the release",
      directory: "/p",
    })
  })
})

describe("overview subtitle", () => {
  test("lists only the values that exist", () => {
    expect(overviewSubtitle({ version: "0.9.3", agents: 5, broker: true })).toEqual([
      { key: "core", version: "0.9.3" },
      { key: "agents", count: 5 },
      { key: "broker", count: 1 },
    ])
    expect(overviewSubtitle({ version: undefined, agents: 2, broker: false })).toEqual([{ key: "agents", count: 2 }])
  })
})

describe("overview telemetry", () => {
  test("left holds broker and hub, right holds sessions and agents", () => {
    expect(
      overviewTelemetry({ broker: "running", hub: { configured: 3, connected: 2 }, sessions: 4, agents: 5 }),
    ).toEqual({
      left: [
        { key: "broker", state: "running" },
        { key: "hub", connected: 2, configured: 3 },
      ],
      right: [
        { key: "sessions", count: 4 },
        { key: "agents", count: 5 },
      ],
    })
  })

  test("omits the broker and hub items without data", () => {
    expect(overviewTelemetry({ broker: undefined, hub: { configured: 0, connected: 0 }, sessions: 0, agents: 1 })).toEqual({
      left: [],
      right: [
        { key: "sessions", count: 0 },
        { key: "agents", count: 1 },
      ],
    })
  })
})
