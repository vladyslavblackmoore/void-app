const secretPrefix = "secret:"

export type CliMcpServer =
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }

export const mcpSanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_")

const hasSecret = (values: unknown) =>
  Object.values(values && typeof values === "object" ? values : {}).some((value) => String(value).startsWith(secretPrefix))

const record = (value: unknown) =>
  value && typeof value === "object" ? (Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)])) as Record<string, string>) : undefined

function mapServer(entry: unknown): CliMcpServer | undefined {
  if (!entry || typeof entry !== "object") return
  const item = entry as Record<string, unknown>
  if (item["enabled"] === false) return
  if (item["type"] === "local") {
    const command = item["command"]
    if (!Array.isArray(command) || command.length === 0) return
    if (command.some((part) => String(part).startsWith(secretPrefix)) || hasSecret(item["environment"])) return
    const [head, ...args] = command.map(String)
    const env = record(item["environment"])
    return { type: "stdio", command: head!, args, ...(env ? { env } : {}) }
  }
  if (item["type"] === "remote") {
    const url = item["url"]
    if (typeof url !== "string" || hasSecret(item["headers"])) return
    const headers = record(item["headers"])
    return { type: "http", url, ...(headers ? { headers } : {}) }
  }
}

const collides = (a: string, b: string) => a === b || a.startsWith(`${b}_`) || b.startsWith(`${a}_`)

export function mapMcpServers(mcp: unknown): Record<string, CliMcpServer> {
  if (!mcp || typeof mcp !== "object") return {}
  const found = Object.entries(mcp)
    .map(([name, entry]) => [name, mapServer(entry)] as const)
    .filter((pair): pair is readonly [string, CliMcpServer] => pair[1] !== undefined)
  const clashing = found
    .filter(([name]) => found.some(([other]) => other !== name && collides(mcpSanitize(name), mcpSanitize(other))))
    .map(([name]) => name)
  if (clashing.length > 0)
    console.warn(`broker: mcp servers dropped because their tool names would be ambiguous: ${clashing.join(", ")}`)
  return Object.fromEntries(found.filter(([name]) => !clashing.includes(name)))
}
