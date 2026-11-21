const secretPrefix = "secret:"

export const mcpSanitize = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "_")

const hasSecret = (values) =>
  Object.values(values && typeof values === "object" ? values : {}).some((value) => String(value).startsWith(secretPrefix))

const record = (value) =>
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)])) : undefined

function mapServer(entry) {
  if (!entry || typeof entry !== "object") return
  if (entry.enabled === false) return
  if (entry.type === "local") {
    const command = entry.command
    if (!Array.isArray(command) || command.length === 0) return
    if (command.some((part) => String(part).startsWith(secretPrefix)) || hasSecret(entry.environment)) return
    const [head, ...args] = command.map(String)
    const env = record(entry.environment)
    return { type: "stdio", command: head, args, ...(env ? { env } : {}) }
  }
  if (entry.type === "remote") {
    const url = entry.url
    if (typeof url !== "string" || hasSecret(entry.headers)) return
    const headers = record(entry.headers)
    return { type: "http", url, ...(headers ? { headers } : {}) }
  }
}

const collides = (a, b) => a === b || a.startsWith(`${b}_`) || b.startsWith(`${a}_`)

export function mapMcpServers(mcp, label = "broker") {
  if (!mcp || typeof mcp !== "object") return {}
  const found = Object.entries(mcp)
    .map(([name, entry]) => [name, mapServer(entry)])
    .filter(([, server]) => server !== undefined)
  const clashing = found
    .filter(([name]) => found.some(([other]) => other !== name && collides(mcpSanitize(name), mcpSanitize(other))))
    .map(([name]) => name)
  if (clashing.length > 0)
    console.warn(`${label}: mcp servers dropped because their tool names would be ambiguous: ${clashing.join(", ")}`)
  return Object.fromEntries(found.filter(([name]) => !clashing.includes(name)))
}
