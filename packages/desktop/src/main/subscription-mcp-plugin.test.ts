import { describe, expect, test } from "bun:test"
import { join } from "node:path"

type Output = { options: Record<string, unknown> }
type Hooks = { "chat.params": (input: unknown, output: Output) => Promise<void> }
type Plugin = { id: string; server: (input: { client: unknown }) => Promise<Hooks> }

const plugin = (await import(join(import.meta.dir, "../../resources/plugin/subscription-mcp.js"))).default as Plugin

const memory = { type: "local", command: ["bun", "main.ts"], environment: { VOID_MEMORY_DB: "/space/graph.db" } }
const other = { type: "remote", url: "https://x.example" }

const agentRules = [
  { permission: "*", pattern: "*", action: "allow" },
  { permission: "mail_send", pattern: "*", action: "ask" },
]
const sessionRules = [{ permission: "memory_forget", pattern: "*", action: "deny" }]

const client = (data: unknown, fail = false, extra: { agents?: unknown; session?: unknown } = {}) => ({
  config: { get: async () => (fail ? Promise.reject(new Error("down")) : { data }) },
  app: {
    agents: async () =>
      "agents" in extra ? extra.agents : { data: [{ name: "main", permission: [] }, { name: "worker", permission: agentRules }] },
  },
  session: {
    get: async () => ("session" in extra ? extra.session : { data: { id: "s1", permission: sessionRules } }),
  },
})

const run = async (c: unknown, providerID = "subscription", agent = "worker") => {
  const hooks = await plugin.server({ client: c })
  const output: Output = { options: { effort: "low" } }
  await hooks["chat.params"]({ sessionID: "s1", agent, model: { providerID } }, output)
  return output.options
}

describe("subscription mcp plugin", () => {
  test("puts the resolved mcp config into the provider options of the call", async () => {
    const options = await run(client({ mcp: { memory, other }, model: "x" }))
    expect(options.effort).toBe("low")
    expect(options.mcp).toEqual({
      memory: { ...memory, environment: { ...memory.environment, VOID_MEMORY_AGENT: "worker" } },
      other,
    })
  })

  test("passes the permission rules of the agent and of the session", async () => {
    const options = await run(client({ mcp: { memory } }))
    expect(options.mcpRules).toEqual([...agentRules, ...sessionRules])
  })

  test("passes the agent rules alone when the session cannot be read", async () => {
    const options = await run(client({ mcp: { memory } }, false, { session: undefined }))
    expect(options.mcpRules).toEqual(agentRules)
  })

  test("leaves the options alone when the rules of the agent are not reachable", async () => {
    expect(await run(client({ mcp: { memory } }, false, { agents: undefined }))).toEqual({ effort: "low" })
    expect(await run(client({ mcp: { memory } }), "subscription", "unknown")).toEqual({ effort: "low" })
  })

  test("leaves the options alone with an empty mcp object", async () => {
    expect(await run(client({ mcp: {} }))).toEqual({ effort: "low" })
  })

  test("keeps an agent id that the config already sets", async () => {
    const own = { ...memory, environment: { ...memory.environment, VOID_MEMORY_AGENT: "fixed" } }
    expect((await run(client({ mcp: { memory: own } }))).mcp).toEqual({ memory: own })
  })

  test("leaves other providers alone", async () => {
    expect(await run(client({ mcp: { memory } }), "anthropic")).toEqual({ effort: "low" })
  })

  test("leaves the options alone without a config or when the read fails", async () => {
    expect(await run(client({}))).toEqual({ effort: "low" })
    expect(await run(client(undefined, true))).toEqual({ effort: "low" })
  })
})
