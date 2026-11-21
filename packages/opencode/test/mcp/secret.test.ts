import path from "node:path"
import { describe, expect } from "bun:test"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { Effect } from "effect"
import { Config } from "../../src/config/config"
import { MCP } from "../../src/mcp/index"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([MCP.node, SecretStore.node, Config.node])))
const envFixture = path.join(import.meta.dir, "../fixture/mcp-env-stdio.ts")
const value = "probe-7c41e0-private-value"

const local = (environment: Record<string, string>) => ({
  type: "local" as const,
  command: [process.execPath, envFixture, "PROBE_TOKEN"],
  environment,
})

const status = (result: { status: Record<string, MCP.Status> | MCP.Status }, name: string) =>
  "status" in result.status ? result.status : result.status[name]

const serve = Effect.acquireRelease(
  Effect.promise(async () => {
    const requests: Headers[] = []
    const protocol = new Server({ name: "secret-headers", version: "1.0.0" }, { capabilities: { tools: {} } })
    protocol.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({ tools: [] }))
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    })
    await protocol.connect(transport)
    const http = Bun.serve({
      port: 0,
      fetch(request) {
        requests.push(new Headers(request.headers))
        return transport.handleRequest(request)
      },
    })
    return {
      requests,
      url: http.url.toString(),
      close: async () => {
        await http.stop(true)
        await protocol.close()
      },
    }
  }),
  (server) => Effect.promise(server.close),
)

describe("mcp secret references", () => {
  it.instance(
    "resolves a secret: environment value at spawn and leaves the config unsubstituted",
    () =>
      Effect.gen(function* () {
        const secrets = yield* SecretStore.Service
        yield* secrets.set("probe/token", value)
        const mcp = yield* MCP.Service

        expect((yield* mcp.tools())["probe_env"]?.def.description).toBe(value)
        expect(yield* mcp.status()).toEqual({ probe: { status: "connected" } })

        const config = yield* (yield* Config.Service).get()
        expect(config.mcp?.probe).toMatchObject({ environment: { PROBE_TOKEN: "secret:probe/token" } })
        expect(JSON.stringify(config)).not.toContain(value)
        yield* secrets.delete("probe/token")
      }),
    { config: { formatter: false, lsp: false, mcp: { probe: local({ PROBE_TOKEN: "secret:probe/token" }) } } },
  )

  it.instance("does not change the entry passed to add", () =>
    Effect.gen(function* () {
      const secrets = yield* SecretStore.Service
      yield* secrets.set("probe/added", value)
      const mcp = yield* MCP.Service
      const entry = local({ PROBE_TOKEN: "secret:probe/added" })

      expect(status(yield* mcp.add("added", entry), "added")).toEqual({ status: "connected" })
      expect((yield* mcp.tools())["added_env"]?.def.description).toBe(value)
      expect(entry.environment).toEqual({ PROBE_TOKEN: "secret:probe/added" })
      yield* secrets.delete("probe/added")
    }),
  )

  it.instance("keeps literal environment values", () =>
    Effect.gen(function* () {
      const mcp = yield* MCP.Service
      expect(status(yield* mcp.add("literal", local({ PROBE_TOKEN: "plain-value" })), "literal")).toEqual({
        status: "connected",
      })
      expect((yield* mcp.tools())["literal_env"]?.def.description).toBe("plain-value")
    }),
  )

  it.instance("refuses a keychain: reference and names secret: as the replacement", () =>
    Effect.gen(function* () {
      const mcp = yield* MCP.Service
      const result = status(yield* mcp.add("keychain", local({ PROBE_TOKEN: "keychain:tracker/token" })), "keychain")

      expect(result.status).toBe("failed")
      const error = result.status === "failed" ? result.error : ""
      expect(error).toContain("keychain:")
      expect(error).toContain("secret:")
      expect(yield* mcp.tools()).toEqual({})
    }),
  )

  it.instance("fails a server whose secret is missing with the name only", () =>
    Effect.gen(function* () {
      const mcp = yield* MCP.Service
      const result = status(yield* mcp.add("missing", local({ PROBE_TOKEN: "secret:probe/absent" })), "missing")

      expect(result).toEqual({ status: "failed", error: expect.stringContaining('"probe/absent"') })
    }),
  )

  it.instance("resolves a secret: header value for a remote server", () =>
    Effect.gen(function* () {
      const secrets = yield* SecretStore.Service
      yield* secrets.set("remote/auth", `Bearer ${value}`)
      const server = yield* serve
      const mcp = yield* MCP.Service
      const entry = {
        type: "remote" as const,
        url: server.url,
        oauth: false as const,
        headers: { Authorization: "secret:remote/auth", "X-Plain": "plain" },
      }

      expect(status(yield* mcp.add("remote", entry), "remote")).toEqual({ status: "connected" })
      expect(server.requests.length).toBeGreaterThan(0)
      for (const headers of server.requests) {
        expect(headers.get("authorization")).toBe(`Bearer ${value}`)
        expect(headers.get("x-plain")).toBe("plain")
      }
      expect(entry.headers.Authorization).toBe("secret:remote/auth")
      yield* secrets.delete("remote/auth")
    }),
  )
})
