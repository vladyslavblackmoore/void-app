const provider = "subscription"
const memoryDatabase = "VOID_MEMORY_DB"
const memoryAgent = "VOID_MEMORY_AGENT"

function withAgent(mcp, agent) {
  return Object.fromEntries(
    Object.entries(mcp).map(([name, entry]) => {
      const environment = entry?.type === "local" ? entry.environment : undefined
      if (!environment?.[memoryDatabase] || environment[memoryAgent]) return [name, entry]
      return [name, { ...entry, environment: { ...environment, [memoryAgent]: agent } }]
    }),
  )
}

const rules = (value) => (Array.isArray(value) ? value : undefined)

async function agentRules(client, name) {
  const result = await client.app.agents().catch(() => undefined)
  const agents = result?.data
  if (!Array.isArray(agents)) return
  return rules(agents.find((agent) => agent?.name === name)?.permission)
}

async function sessionRules(client, sessionID) {
  const result = await client.session.get({ path: { id: sessionID } }).catch(() => undefined)
  return rules(result?.data?.permission) ?? []
}

export default {
  id: "void.subscription-mcp",
  server: async ({ client }) => ({
    "chat.params": async (input, output) => {
      if (input.model?.providerID !== provider) return
      const result = await client.config.get().catch(() => undefined)
      const mcp = result?.data?.mcp
      if (!mcp || typeof mcp !== "object" || Object.keys(mcp).length === 0) return
      const agent = await agentRules(client, input.agent)
      if (!agent) return
      output.options.mcp = withAgent(mcp, input.agent)
      output.options.mcpRules = [...agent, ...(await sessionRules(client, input.sessionID))]
    },
  }),
}
