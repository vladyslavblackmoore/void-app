import fs from "node:fs/promises"
import path from "node:path"
import { afterAll, afterEach, describe, expect } from "bun:test"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Global } from "@opencode-ai/core/global"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { Effect } from "effect"
import { Config } from "../../src/config/config"
import { MCP } from "../../src/mcp/index"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([MCP.node, SecretStore.node, Config.node])))
const envFixture = path.join(import.meta.dir, "../fixture/mcp-env-stdio.ts")
const globalFile = path.join(Global.Path.config, "config.json")
const value = "probe-7c41e0-private-value"

const local = (environment: Record<string, string>) => ({
  type: "local" as const,
  command: [process.execPath, envFixture, "PROBE_TOKEN"],
  environment,
})

const status = (result: { status: Record<string, MCP.Status> | MCP.Status }, name: string) =>
  "status" in result.status ? result.status : result.status[name]

const failedError = (value: unknown) =>
  typeof value === "object" && value !== null && "error" in value ? String(value.error) : ""

const listen = async () => {
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
}

const trusted = await listen()
const untrusted = await listen()

afterAll(async () => {
  await trusted.close()
  await untrusted.close()
})

afterEach(async () => {
  await fs.rm(globalFile, { force: true })
  trusted.requests.length = 0
  untrusted.requests.length = 0
})

const userConfig = (mcp: ConfigV1.Info["mcp"]) => () =>
  Effect.promise(() => Bun.write(globalFile, JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp })))

const remoteEntry = (url: string, headers: Record<string, string>) => ({
  type: "remote" as const,
  url,
  oauth: false as const,
  headers,
})

const sentValue = (requests: Headers[]) =>
  requests.some((headers) => [...headers.values()].some((item) => item.includes(value)))

const projectOptions = { formatter: false as const, lsp: false as const }

describe("mcp secret references", () => {
  it.instance(
    "resolves a secret: environment value of a user config server at spawn and leaves the config unsubstituted",
    () =>
      Effect.gen(function* () {
        const secrets = yield* SecretStore.Service
        yield* secrets.set("probe/token", value)
        const mcp = yield* MCP.Service

        expect((yield* mcp.tools())["probe_env"]?.def.description).toBe(value)
        expect(yield* mcp.status()).toEqual({ probe: { status: "connected" } })

        const config = yield* Config.Service
        expect((yield* config.get()).mcp?.probe).toMatchObject({ environment: { PROBE_TOKEN: "secret:probe/token" } })
        expect(JSON.stringify(yield* config.get())).not.toContain(value)
        expect(JSON.stringify(yield* config.getGlobal())).not.toContain(value)
        yield* secrets.delete("probe/token")
      }),
    { config: projectOptions, init: userConfig({ probe: local({ PROBE_TOKEN: "secret:probe/token" }) }) },
  )

  it.instance(
    "resolves a secret: header value of a user config remote server and keeps the entry unchanged",
    () =>
      Effect.gen(function* () {
        const secrets = yield* SecretStore.Service
        yield* secrets.set("remote/auth", `Bearer ${value}`)
        const mcp = yield* MCP.Service

        expect(yield* mcp.status()).toEqual({ remote: { status: "connected" } })
        expect(trusted.requests.length).toBeGreaterThan(0)
        for (const headers of trusted.requests) {
          expect(headers.get("authorization")).toBe(`Bearer ${value}`)
          expect(headers.get("x-plain")).toBe("plain")
        }
        const config = yield* Config.Service
        expect((yield* config.get()).mcp?.remote).toMatchObject({
          headers: { Authorization: "secret:remote/auth" },
        })
        yield* secrets.delete("remote/auth")
      }),
    {
      config: projectOptions,
      init: userConfig({
        remote: remoteEntry(trusted.url, { Authorization: "secret:remote/auth", "X-Plain": "plain" }),
      }),
    },
  )

  it.instance(
    "refuses a secret: header of a project config server and sends no value",
    () =>
      Effect.gen(function* () {
        const secrets = yield* SecretStore.Service
        yield* secrets.set("project/token", value)
        const mcp = yield* MCP.Service

        const result = (yield* mcp.status()).project
        expect(result?.status).toBe("failed")
        expect(failedError(result)).toContain('MCP server "project" header X-Token')
        expect(failedError(result)).not.toContain(value)
        expect(sentValue(untrusted.requests)).toBe(false)
        yield* secrets.delete("project/token")
      }),
    { config: { ...projectOptions, mcp: { project: remoteEntry(untrusted.url, { "X-Token": "secret:project/token" }) } } },
  )

  it.instance(
    "refuses a user config secret when the project config moves the server to another url",
    () =>
      Effect.gen(function* () {
        const secrets = yield* SecretStore.Service
        yield* secrets.set("shared/token", value)
        const mcp = yield* MCP.Service

        const config = yield* Config.Service
        expect((yield* config.get()).mcp?.shared).toMatchObject({
          url: untrusted.url,
          headers: { "X-Token": "secret:shared/token" },
        })
        expect(failedError((yield* mcp.status()).shared)).toContain('MCP server "shared" header X-Token')
        expect(sentValue(untrusted.requests)).toBe(false)
        expect(sentValue(trusted.requests)).toBe(false)
        yield* secrets.delete("shared/token")
      }),
    {
      config: { ...projectOptions, mcp: { shared: { type: "remote", url: untrusted.url } } },
      init: userConfig({ shared: remoteEntry(trusted.url, { "X-Token": "secret:shared/token" }) }),
    },
  )

  it.instance("refuses a secret: reference in an entry added at runtime that the user config does not define", () =>
    Effect.gen(function* () {
      const secrets = yield* SecretStore.Service
      yield* secrets.set("probe/added", value)
      const mcp = yield* MCP.Service
      const result = status(yield* mcp.add("added", local({ PROBE_TOKEN: "secret:probe/added" })), "added")

      expect(failedError(result)).toContain('MCP server "added" environment PROBE_TOKEN')
      expect(failedError(result)).not.toContain(value)
      expect(yield* mcp.tools()).toEqual({})
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
      expect(failedError(result)).toContain("keychain:")
      expect(failedError(result)).toContain("secret:")
      expect(yield* mcp.tools()).toEqual({})
    }),
  )

  it.instance(
    "fails a user config server whose secret is missing with the name only",
    () =>
      Effect.gen(function* () {
        const mcp = yield* MCP.Service
        expect((yield* mcp.status()).missing).toEqual({
          status: "failed",
          error: expect.stringContaining('"probe/absent"'),
        })
      }),
    { config: projectOptions, init: userConfig({ missing: local({ PROBE_TOKEN: "secret:probe/absent" }) }) },
  )
})
