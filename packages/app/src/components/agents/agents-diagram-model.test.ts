import { describe, expect, test } from "bun:test"
import { buildAgentsDiagram, formatModelRef, linkPaths, parseModelRef } from "./agents-diagram-model"

const providers = [
  {
    id: "subscription",
    models: { opus: { capabilities: { toolcall: true } }, plain: { capabilities: { toolcall: false } } },
  },
]

const agents = [
  { name: "main", mode: "primary" as const, description: "Primary" },
  {
    name: "worker",
    mode: "subagent" as const,
    model: { providerID: "subscription", modelID: "opus" },
    variant: "high",
  },
  { name: "doc", mode: "subagent" as const },
  { name: "secret", mode: "subagent" as const, hidden: true },
  { name: "plan", mode: "primary" as const },
]

describe("model refs", () => {
  test("parses provider and model", () => {
    expect(parseModelRef("subscription/opus")).toEqual({ providerID: "subscription", modelID: "opus" })
    expect(parseModelRef("openrouter/anthropic/sonnet")).toEqual({
      providerID: "openrouter",
      modelID: "anthropic/sonnet",
    })
  })

  test("rejects malformed values", () => {
    expect(parseModelRef(undefined)).toBeUndefined()
    expect(parseModelRef("opus")).toBeUndefined()
    expect(parseModelRef("/opus")).toBeUndefined()
    expect(parseModelRef("subscription/")).toBeUndefined()
  })

  test("formats provider/model", () => {
    expect(formatModelRef({ providerID: "a", modelID: "b" })).toBe("a/b")
  })
})

describe("agents diagram built-ins", () => {
  test("hides the built-in explore and general but keeps explorer and custom agents", () => {
    const diagram = buildAgentsDiagram({
      agents: [
        { name: "main", mode: "primary" },
        { name: "general", mode: "subagent", native: true },
        { name: "explore", mode: "subagent", native: true },
        { name: "explorer", mode: "subagent", native: false },
        { name: "worker", mode: "subagent", native: false },
      ],
      providers,
    })
    expect(diagram.subagents.map((node) => node.name)).toEqual(["explorer", "worker"])
  })

  test("keeps a user-defined agent that reuses a built-in name", () => {
    const diagram = buildAgentsDiagram({
      agents: [
        { name: "main", mode: "primary" },
        { name: "explore", mode: "subagent", native: false },
      ],
      providers,
    })
    expect(diagram.subagents.map((node) => node.name)).toEqual(["explore"])
  })
})

describe("agents diagram", () => {
  test("puts main on top and one node per visible subagent below", () => {
    const diagram = buildAgentsDiagram({ agents, providers })
    expect(diagram.main.name).toBe("main")
    expect(diagram.subagents.map((node) => node.name)).toEqual(["worker", "doc"])
  })

  test("reads model and effort from the agent list", () => {
    const worker = buildAgentsDiagram({ agents, providers }).subagents[0]
    expect(worker?.model).toEqual({ providerID: "subscription", modelID: "opus" })
    expect(worker?.variant).toBe("high")
    expect(worker?.inherits).toBe(false)
    expect(worker?.status).toBe("ready")
  })

  test("falls back to the config when the agent list has no model", () => {
    const diagram = buildAgentsDiagram({
      agents,
      providers,
      config: { doc: { model: "subscription/opus", variant: "low" } },
    })
    const doc = diagram.subagents[1]
    expect(doc?.model).toEqual({ providerID: "subscription", modelID: "opus" })
    expect(doc?.variant).toBe("low")
    expect(doc?.inherits).toBe(false)
  })

  test("marks a subagent without a model as inheriting main", () => {
    const doc = buildAgentsDiagram({ agents, providers }).subagents[1]
    expect(doc?.inherits).toBe(true)
    expect(doc?.model).toBeUndefined()
    expect(doc?.variant).toBeUndefined()
  })

  test("marks a node unavailable when its provider is not connected", () => {
    const diagram = buildAgentsDiagram({ agents, providers: [] })
    expect(diagram.subagents[0]?.status).toBe("unavailable")
  })

  test("main uses the default model when it has none", () => {
    const diagram = buildAgentsDiagram({
      agents,
      providers,
      defaultModel: { providerID: "subscription", modelID: "opus" },
    })
    expect(diagram.main.model).toEqual({ providerID: "subscription", modelID: "opus" })
    expect(diagram.main.status).toBe("ready")
    expect(diagram.subagents[1]?.status).toBe("ready")
  })

  test("reports when the main model has no tool calls", () => {
    const blocked = buildAgentsDiagram({
      agents: [
        { name: "main", mode: "primary", model: { providerID: "subscription", modelID: "plain" } },
        ...agents.slice(1),
      ],
      providers,
    })
    expect(blocked.mainCanStartSubagents).toBe(false)
    expect(buildAgentsDiagram({ agents, providers }).mainCanStartSubagents).toBe(true)
  })

  test("flags only the diagram main node, also when it falls back to a primary agent", () => {
    const diagram = buildAgentsDiagram({
      agents: [
        { name: "build", mode: "primary" },
        { name: "doc", mode: "subagent" },
      ],
      providers,
    })
    expect(diagram.main.name).toBe("build")
    expect(diagram.main.isMain).toBe(true)
    expect(diagram.subagents.every((node) => !node.isMain)).toBe(true)
  })

  test("works without a main agent in the list", () => {
    const diagram = buildAgentsDiagram({ agents: [{ name: "doc", mode: "subagent" }], providers })
    expect(diagram.main.name).toBe("main")
    expect(diagram.subagents.map((node) => node.name)).toEqual(["doc"])
  })
})

describe("empty config values", () => {
  test("treat an empty model and effort as unset", () => {
    const diagram = buildAgentsDiagram({
      agents: [{ name: "doc", mode: "subagent", variant: "" }],
      providers,
      config: { doc: { model: "", variant: "" } },
    })
    expect(diagram.subagents[0]?.inherits).toBe(true)
    expect(diagram.subagents[0]?.variant).toBeUndefined()
  })
})

describe("agent links", () => {
  test("centres each link on its column", () => {
    expect(linkPaths(2).map((link) => link.x)).toEqual([25, 75])
    expect(linkPaths(1)[0]?.x).toBe(50)
  })

  test("starts every link at the main node", () => {
    for (const link of linkPaths(4)) expect(link.d.startsWith("M50 0")).toBe(true)
  })

  test("returns no links without subagents", () => {
    expect(linkPaths(0)).toEqual([])
  })
})
