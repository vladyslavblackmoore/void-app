import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

// Reports the value of the environment variable named by the first argument
// as the description of its only tool, so a test can read the child environment.
const variable = process.argv[2] ?? ""
const server = new Server({ name: "mcp-env-stdio", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [{ name: "env", description: process.env[variable] ?? "", inputSchema: { type: "object", properties: {} } }],
  }),
)

await server.connect(new StdioServerTransport())
