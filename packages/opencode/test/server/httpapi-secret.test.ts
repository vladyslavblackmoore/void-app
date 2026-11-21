import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer, Logger, Option } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { Installation } from "../../src/installation"
import { ServerAuth } from "../../src/server/auth"
import { RootHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { controlHandlers } from "../../src/server/routes/instance/httpapi/handlers/control"
import { controlPlaneHandlers } from "../../src/server/routes/instance/httpapi/handlers/control-plane"
import { globalHandlers } from "../../src/server/routes/instance/httpapi/handlers/global"
import { secretHandlers } from "../../src/server/routes/instance/httpapi/handlers/secret"
import { authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "../../src/server/routes/instance/httpapi/middleware/schema-error"
import { resetDatabase } from "../fixture/db"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, request } from "./httpapi-layer"

const testStateLayer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.promise(() => resetDatabase()),
    () => Effect.promise(() => resetDatabase()),
  ),
)

const it = testEffect(Layer.mergeAll(testStateLayer, LayerNode.compile(FSUtil.node), httpApiLayer))
const value = "route-5d2b97-private-value"
const json = { "content-type": "application/json" }

describe("secret HttpApi", () => {
  it.instance(
    "writes, lists and deletes secrets without returning a value from any route",
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      const bodies: string[] = []
      const send = (path: string, init?: RequestInit) =>
        Effect.gen(function* () {
          const response = yield* request(path, init)
          const text = yield* response.text
          bodies.push(text)
          return { status: response.status, body: text }
        })

      expect(
        yield* send("/secret/demo%2Fapi-token", { method: "PUT", headers: json, body: JSON.stringify({ value }) }),
      ).toEqual({ status: 200, body: "true" })
      expect(
        yield* send("/secret/demo%2Fapi-token", { method: "PUT", headers: json, body: JSON.stringify({ value }) }),
      ).toEqual({ status: 200, body: "true" })

      const listed = yield* send("/secret")
      expect(listed.status).toBe(200)
      expect(JSON.parse(listed.body)).toEqual([{ name: "demo/api-token", updated: expect.any(Number) }])

      const config = yield* send("/config", { headers: { "x-opencode-directory": directory } })
      expect(config.status).toBe(200)
      expect(JSON.parse(config.body).mcp.demo.environment).toEqual({ DEMO_TOKEN: "secret:demo/api-token" })

      expect(yield* send("/secret/demo%2Fapi-token", { method: "DELETE" })).toEqual({ status: 200, body: "true" })
      expect(yield* send("/secret/demo%2Fapi-token", { method: "DELETE" })).toEqual({ status: 200, body: "false" })
      expect(JSON.parse((yield* send("/secret")).body)).toEqual([])

      for (const body of bodies) expect(body).not.toContain(value)
    }),
    {
      config: {
        formatter: false,
        lsp: false,
        mcp: {
          demo: {
            type: "local",
            command: ["demo-mcp"],
            enabled: false,
            environment: { DEMO_TOKEN: "secret:demo/api-token" },
          },
        },
      },
    },
  )

  it.instance(
    "rejects invalid names and missing values",
    Effect.gen(function* () {
      const put = (path: string, body: unknown) =>
        Effect.gen(function* () {
          const response = yield* request(path, { method: "PUT", headers: json, body: JSON.stringify(body) })
          expect(yield* response.text).not.toContain(value)
          return response.status
        })

      expect(yield* put("/secret/Demo", { value })).toBe(400)
      expect(yield* put("/secret/demo%2F%2Fx", { value })).toBe(400)
      expect(yield* put("/secret/demo", {})).toBe(400)
      expect(yield* request("/secret/Demo", { method: "DELETE" }).pipe(Effect.map((response) => response.status))).toBe(
        400,
      )
      const listed = yield* request("/secret")
      expect(yield* listed.json).toEqual([])
    }),
  )
})

// The full app replaces the loggers with its own, so the root API is served
// here with a capturing logger to see what the schema rejection writes.
const logs: string[] = []
const loggedApi = testEffect(
  HttpRouter.serve(
    HttpApiBuilder.layer(RootHttpApi).pipe(
      Layer.provide([controlHandlers, controlPlaneHandlers, globalHandlers, secretHandlers]),
      Layer.provide([authorizationLayer, schemaErrorLayer]),
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      HttpRouter.provideRequest(Layer.succeedContext(Context.empty() as Context.Context<unknown>)),
    ),
    { disableListenLog: true, disableLogger: true },
  ).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provide(Logger.layer([Logger.make((options) => logs.push(Bun.inspect(options.message)))])),
    Layer.provide(Layer.mock(Auth.Service)({})),
    Layer.provide(Layer.mock(SecretStore.Service)({})),
    Layer.provide(Layer.mock(Config.Service)({})),
    Layer.provide(Layer.mock(MoveSession.Service)({})),
    Layer.provide(Layer.mock(Installation.Service)({})),
    Layer.provide(ServerAuth.Config.configLayer({ password: Option.none(), username: "opencode" })),
  ),
)

describe("secret HttpApi malformed bodies", () => {
  loggedApi.live("never echoes the payload in the response or the log", () =>
    Effect.gen(function* () {
      const secretText = "tok-91fe33-raw-body-value"
      const secretNumber = 734591862
      const bodies = [
        { headers: json, body: JSON.stringify(secretText) },
        { headers: { "content-type": "text/plain" }, body: secretText },
        { headers: json, body: secretText },
        { headers: json, body: JSON.stringify({ value: secretNumber }) },
        { headers: json, body: JSON.stringify({ value: [secretText] }) },
      ]
      for (const init of bodies) {
        const response = yield* request("/secret/demo", { method: "PUT", ...init })
        expect([400, 415, 500]).toContain(response.status)
        const text = yield* response.text
        expect(text).not.toContain(secretText)
        expect(text).not.toContain(String(secretNumber))
      }
      expect(logs.some((line) => line.includes("schema rejection"))).toBe(true)
      for (const line of logs) {
        expect(line).not.toContain(secretText)
        expect(line).not.toContain(String(secretNumber))
      }
    }),
  )
})
