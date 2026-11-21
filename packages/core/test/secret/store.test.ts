import { afterAll, describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"
import { Effect, Redacted } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { Global } from "@opencode-ai/core/global"
import { testEffect } from "../lib/effect"
import { tmpdir } from "../fixture/tmpdir"

const root = await tmpdir()
afterAll(() => root[Symbol.asyncDispose]())
const home = (dir: string) => ({ XDG_DATA_HOME: path.join(dir, "data"), XDG_STATE_HOME: path.join(dir, "state") })
const paths = SecretStore.paths(home(root.path))
const it = testEffect(LayerNode.compile(SecretStore.nodeAt(paths)))
const value = "tok-3f9a1c-very-private"

const failure = Effect.flip

const mode = (file: string) => Effect.promise(() => fs.stat(file).then((info) => info.mode & 0o777))

const readStore = () => Effect.promise(() => Bun.file(paths.store).text())

describe("SecretStore.paths", () => {
  it.live("keeps the key and the data in different directories under the VOID home", () =>
    Effect.sync(() => {
      const voidHome = SecretStore.paths({ XDG_DATA_HOME: "/v/data", XDG_STATE_HOME: "/v/state" })
      expect(voidHome.store).toBe(path.join("/v/data", "secrets", "store.json"))
      expect(voidHome.key).toBe(path.join("/v/state", "secrets", "master.key"))
      expect(path.dirname(voidHome.store)).not.toBe(path.dirname(voidHome.key))
      expect(
        SecretStore.paths({
          XDG_DATA_HOME: "/v/data",
          XDG_STATE_HOME: "/v/state",
          VOID_SECRET_KEY_FILE: "/vol/key/master.key",
        }).key,
      ).toBe("/vol/key/master.key")
    }),
  )

  it.live("uses the namespaced app directories when the XDG variables are unset", () =>
    Effect.sync(() => {
      const fallback = SecretStore.paths({})
      expect(fallback.store).toBe(path.join(Global.Path.data, "secrets", "store.json"))
      expect(fallback.key).toBe(path.join(Global.Path.state, "secrets", "master.key"))
      expect(path.basename(path.dirname(path.dirname(fallback.store)))).toBe("opencode")
      expect(path.basename(path.dirname(path.dirname(fallback.key)))).toBe("opencode")
      expect(SecretStore.paths({ XDG_DATA_HOME: "", XDG_STATE_HOME: "" })).toEqual(fallback)
    }),
  )
})

describe("SecretStore", () => {
  it.live("sets, gets, lists, replaces and deletes a secret", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      yield* store.set("tracker/token", value)
      yield* store.set("mail.app_key-1", "second")

      const got = yield* store.get("tracker/token")
      expect(Redacted.isRedacted(got)).toBe(true)
      expect(Bun.inspect(got)).not.toContain(value)
      expect(JSON.stringify(got)).not.toContain(value)
      expect(Redacted.value(got)).toBe(value)

      const listed = yield* store.list()
      expect(listed.map((item) => item.name)).toEqual(["mail.app_key-1", "tracker/token"])
      expect(listed.every((item) => typeof item.updated === "number" && item.updated > 0)).toBe(true)
      expect(JSON.stringify(listed)).not.toContain(value)

      yield* store.set("tracker/token", "replaced")
      expect(Redacted.value(yield* store.get("tracker/token"))).toBe("replaced")

      expect(yield* store.delete("tracker/token")).toBe(true)
      expect(yield* store.delete("tracker/token")).toBe(false)
      expect(yield* failure(store.get("tracker/token"))).toBeInstanceOf(SecretStore.NotFoundError)
      expect((yield* store.list()).map((item) => item.name)).toEqual(["mail.app_key-1"])
      yield* store.delete("mail.app_key-1")
    }),
  )

  it.live("writes no plaintext into the store file", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      yield* store.set("plain/check", value)
      const text = yield* readStore()
      expect(text).not.toContain(value)
      expect(text).not.toContain(Buffer.from(value).toString("base64"))
      expect(text).not.toContain(Buffer.from(value).toString("hex"))
      const data = JSON.parse(text)
      expect(data.version).toBe(SecretStore.VERSION)
      expect(Object.keys(data.entries["plain/check"]).sort()).toEqual(["ciphertext", "nonce", "tag", "updated"])
      expect(Buffer.from(data.entries["plain/check"].nonce, "base64").length).toBe(12)
      yield* store.delete("plain/check")
    }),
  )

  it.live("fails to decrypt an entry moved under another name", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      yield* store.set("moved/from", value)
      const data = JSON.parse(yield* readStore())
      data.entries["moved/to"] = data.entries["moved/from"]
      yield* Effect.promise(() => Bun.write(paths.store, JSON.stringify(data)))

      expect(Redacted.value(yield* store.get("moved/from"))).toBe(value)
      const error = yield* failure(store.get("moved/to"))
      expect(error).toBeInstanceOf(SecretStore.DecryptError)
      expect(String(error)).not.toContain(value)
      yield* store.delete("moved/from")
      yield* store.delete("moved/to")
    }),
  )

  it.live("fails with a wrong, invalid or missing master key", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      yield* store.set("key/check", value)
      const original = yield* Effect.promise(() => fs.readFile(paths.key))
      expect(original.length).toBe(32)

      yield* Effect.promise(() => fs.writeFile(paths.key, randomBytes(32)))
      expect(yield* failure(store.get("key/check"))).toBeInstanceOf(SecretStore.DecryptError)

      yield* Effect.promise(() => fs.writeFile(paths.key, randomBytes(16)))
      expect(yield* failure(store.get("key/check"))).toMatchObject({ _tag: "SecretKeyError", reason: "invalid" })

      yield* Effect.promise(() => fs.rm(paths.key))
      expect(yield* failure(store.get("key/check"))).toMatchObject({ _tag: "SecretKeyError", reason: "missing" })

      yield* Effect.promise(() => fs.writeFile(paths.key, original, { mode: 0o600 }))
      expect(Redacted.value(yield* store.get("key/check"))).toBe(value)
      yield* store.delete("key/check")
    }),
  )

  it.live("creates files with mode 0600 and directories with mode 0700 on the first write", () =>
    Effect.gen(function* () {
      const fresh = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      const target = SecretStore.paths(home(fresh.path))
      expect(yield* Effect.promise(() => fs.readdir(fresh.path))).toEqual([])
      const previous = process.umask(0)
      yield* SecretStore.Service.use((store) => store.set("mode/check", value)).pipe(
        Effect.provide(LayerNode.compile(SecretStore.nodeAt(target))),
        Effect.ensuring(Effect.sync(() => process.umask(previous))),
      )
      expect(yield* mode(target.store)).toBe(0o600)
      expect(yield* mode(target.key)).toBe(0o600)
      expect(yield* mode(path.dirname(target.store))).toBe(0o700)
      expect(yield* mode(path.dirname(target.key))).toBe(0o700)
      expect(yield* Effect.promise(() => fs.readdir(path.dirname(target.store)))).toEqual(["store.json"])
      expect(yield* Effect.promise(() => fs.readdir(path.dirname(target.key)))).toEqual(["master.key"])
    }),
  )

  it.live("refuses to create a new key while the store has entries", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      yield* store.set("key/first", value)
      const original = yield* Effect.promise(() => fs.readFile(paths.key))
      yield* Effect.promise(() => fs.rm(paths.key))

      expect(yield* failure(store.set("key/second", "other"))).toMatchObject({
        _tag: "SecretKeyError",
        reason: "missing",
      })
      expect(yield* Effect.promise(() => Bun.file(paths.key).exists())).toBe(false)

      yield* Effect.promise(() => fs.writeFile(paths.key, original, { mode: 0o600 }))
      expect(Redacted.value(yield* store.get("key/first"))).toBe(value)
      expect(yield* failure(store.get("key/second"))).toBeInstanceOf(SecretStore.NotFoundError)
      yield* store.delete("key/first")
    }),
  )

  it.live("rejects invalid names", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      const invalid = ["", "Tracker", "-a", "a//b", "a/", "/a", "a b", "a:b", "../x", "a/.", "_a", "a/-b"]
      for (const name of invalid) {
        expect(SecretStore.valid(name)).toBe(false)
        expect(yield* failure(store.set(name, value))).toBeInstanceOf(SecretStore.InvalidNameError)
        expect(yield* failure(store.get(name))).toBeInstanceOf(SecretStore.InvalidNameError)
        expect(yield* failure(store.delete(name))).toBeInstanceOf(SecretStore.InvalidNameError)
      }
      for (const name of ["tracker/token", "a", "0", "a.b_c-d/e1/f"]) expect(SecretStore.valid(name)).toBe(true)
      expect(yield* store.list()).toEqual([])
    }),
  )
})
