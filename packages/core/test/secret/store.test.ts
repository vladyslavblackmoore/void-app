import { afterAll, describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"
import { Effect, Redacted } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SecretStore } from "@opencode-ai/core/secret/store"
import { testEffect } from "../lib/effect"
import { tmpdir } from "../fixture/tmpdir"

const root = await tmpdir()
afterAll(() => root[Symbol.asyncDispose]())
const paths = SecretStore.paths({ data: path.join(root.path, "data"), state: path.join(root.path, "state") })
const it = testEffect(LayerNode.compile(SecretStore.nodeAt(paths)))
const value = "tok-3f9a1c-very-private"

const failure = Effect.flip

const mode = (file: string) => Effect.promise(() => fs.stat(file).then((info) => info.mode & 0o777))

const readStore = () => Effect.promise(() => Bun.file(paths.store).text())

describe("SecretStore.paths", () => {
  it.live("keeps the key and the data in different directories under the VOID home", () =>
    Effect.sync(() => {
      const home = SecretStore.paths({ data: "/v/data", state: "/v/state" })
      expect(home.store).toBe(path.join("/v/data", "secrets", "store.json"))
      expect(home.key).toBe(path.join("/v/state", "secrets", "master.key"))
      expect(path.dirname(home.store)).not.toBe(path.dirname(home.key))
      expect(SecretStore.paths({ data: "/v/data", state: "/v/state" }, "/vol/key/master.key").key).toBe(
        "/vol/key/master.key",
      )
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

  it.live("creates files with mode 0600 and directories with mode 0700", () =>
    Effect.gen(function* () {
      const store = yield* SecretStore.Service
      const previous = process.umask(0)
      yield* store.set("mode/check", value).pipe(Effect.ensuring(Effect.sync(() => process.umask(previous))))
      expect(yield* mode(paths.store)).toBe(0o600)
      expect(yield* mode(paths.key)).toBe(0o600)
      expect(yield* mode(path.dirname(paths.store))).toBe(0o700)
      expect(yield* mode(path.dirname(paths.key))).toBe(0o700)
      expect(yield* Effect.promise(() => fs.readdir(path.dirname(paths.store)))).toEqual(["store.json"])
      expect(yield* Effect.promise(() => fs.readdir(path.dirname(paths.key)))).toEqual(["master.key"])
      yield* store.delete("mode/check")
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
