import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Layer } from "effect"
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
