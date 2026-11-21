import { describe, expect } from "bun:test"
import { readdir, readFile, rm, stat, writeFile } from "fs/promises"
import path from "path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Global } from "@opencode-ai/core/global"
import { Effect } from "effect"
import { Auth } from "../../src/auth"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Auth.node))

describe("Auth", () => {
  it.instance("set normalizes trailing slashes in keys", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com/", {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      })
      const data = yield* auth.all()
      expect(data["https://example.com"]).toBeDefined()
      expect(data["https://example.com/"]).toBeUndefined()
    }),
  )

  it.instance("set cleans up pre-existing trailing-slash entry", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com/", {
        type: "wellknown",
        key: "TOKEN",
        token: "old",
      })
      yield* auth.set("https://example.com", {
        type: "wellknown",
        key: "TOKEN",
        token: "new",
      })
      const data = yield* auth.all()
      const keys = Object.keys(data).filter((key) => key.includes("example.com"))
      expect(keys).toEqual(["https://example.com"])
      const entry = data["https://example.com"]!
      expect(entry.type).toBe("wellknown")
      if (entry.type === "wellknown") expect(entry.token).toBe("new")
    }),
  )

  it.instance("remove deletes both trailing-slash and normalized keys", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com", {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      })
      yield* auth.remove("https://example.com/")
      const data = yield* auth.all()
      expect(data["https://example.com"]).toBeUndefined()
      expect(data["https://example.com/"]).toBeUndefined()
    }),
  )

  it.instance("set and remove are no-ops on keys without trailing slashes", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("anthropic", {
        type: "api",
        key: "sk-test",
      })
      const data = yield* auth.all()
      expect(data["anthropic"]).toBeDefined()
      yield* auth.remove("anthropic")
      const after = yield* auth.all()
      expect(after["anthropic"]).toBeUndefined()
    }),
  )

  it.instance("a broken auth file is never overwritten by remove or set", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const file = path.join(Global.Path.data, "auth.json")
      const broken = '{"openai": {"type": "api", "key": "sk-'
      yield* Effect.promise(() => writeFile(file, broken))
      const removed = yield* auth.remove("subscription").pipe(Effect.exit)
      const stored = yield* auth.set("other", { type: "api", key: "x" }).pipe(Effect.exit)
      const read = yield* auth.all().pipe(Effect.exit)
      const text = yield* Effect.promise(() => readFile(file, "utf8"))
      yield* Effect.promise(() => rm(file, { force: true }))
      expect(removed._tag).toBe("Failure")
      expect(stored._tag).toBe("Failure")
      expect(read._tag).toBe("Failure")
      expect(text).toBe(broken)
    }),
  )

  it.instance("a missing auth file reads as empty", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* Effect.promise(() => rm(path.join(Global.Path.data, "auth.json"), { force: true }))
      expect(yield* auth.all()).toEqual({})
    }),
  )

  it.instance("concurrent writes keep every entry", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const keys = Array.from({ length: 12 }, (_, index) => `provider-${index}`)
      yield* Effect.forEach(keys, (key) => auth.set(key, { type: "api", key }), { concurrency: "unbounded" })
      yield* Effect.forEach(keys.slice(0, 4), (key) => auth.remove(key), { concurrency: "unbounded" })
      const data = yield* auth.all()
      for (const key of keys.slice(0, 4)) yield* auth.remove(key)
      for (const key of keys.slice(4)) yield* auth.remove(key)
      expect(keys.filter((key) => data[key]).sort()).toEqual(keys.slice(4).sort())
    }),
  )

  it.instance("writes replace the file atomically with owner-only access", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("anthropic", { type: "api", key: "sk-test" })
      const info = yield* Effect.promise(() => stat(path.join(Global.Path.data, "auth.json")))
      const leftovers = yield* Effect.promise(() => readdir(Global.Path.data))
      yield* auth.remove("anthropic")
      expect(info.mode & 0o777).toBe(0o600)
      expect(leftovers.filter((name) => name.startsWith("auth.json") && name !== "auth.json")).toEqual([])
    }),
  )
})
