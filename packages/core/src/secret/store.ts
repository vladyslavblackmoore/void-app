export * as SecretStore from "./store"

import path from "path"
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "crypto"
import { xdgData, xdgState } from "xdg-basedir"
import { Clock, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { FSUtil } from "../fs-util"
import { EffectFlock } from "../util/effect-flock"
import { makeGlobalNode } from "../effect/app-node"
import { serviceUse } from "../effect/service-use"

export const VERSION = 1

export const NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/

export const Name = Schema.String.check(Schema.isPattern(NAME))

export const valid = Schema.is(Name)

export class InvalidNameError extends Schema.TaggedErrorClass<InvalidNameError>()("SecretInvalidNameError", {
  secret: Schema.String,
}) {
  override get message() {
    return `Invalid secret name "${this.secret}": expected ${NAME.source}`
  }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("SecretNotFoundError", {
  secret: Schema.String,
}) {
  override get message() {
    return `Secret "${this.secret}" not found`
  }
}

export class DecryptError extends Schema.TaggedErrorClass<DecryptError>()("SecretDecryptError", {
  secret: Schema.String,
}) {
  override get message() {
    return `Secret "${this.secret}" failed to decrypt`
  }
}

export class KeyError extends Schema.TaggedErrorClass<KeyError>()("SecretKeyError", {
  reason: Schema.Literals(["missing", "invalid"]),
  path: Schema.String,
}) {
  override get message() {
    return `Secret master key is ${this.reason}: ${this.path}`
  }
}

export class StoreError extends Schema.TaggedErrorClass<StoreError>()("SecretStoreError", {
  path: Schema.String,
}) {
  override get message() {
    return `Secret store is unreadable: ${this.path}`
  }
}

export type Error = InvalidNameError | NotFoundError | DecryptError | KeyError | StoreError

export interface Paths {
  readonly store: string
  readonly key: string
}

// The only place that maps a VOID home (the XDG data and state directories the
// desktop app sets for the core) to the store and key files.
export function paths(
  home: { readonly data: string; readonly state: string } = { data: xdgData!, state: xdgState! },
  keyFile = process.env.VOID_SECRET_KEY_FILE,
): Paths {
  return {
    store: path.join(home.data, "secrets", "store.json"),
    key: keyFile ? path.resolve(keyFile) : path.join(home.state, "secrets", "master.key"),
  }
}

export interface Entry {
  readonly name: string
  readonly updated: number
}

export interface Interface {
  readonly set: (name: string, value: string) => Effect.Effect<void, InvalidNameError | KeyError | StoreError>
  readonly get: (name: string) => Effect.Effect<Redacted.Redacted, Error>
  readonly list: () => Effect.Effect<Entry[], StoreError>
  readonly delete: (name: string) => Effect.Effect<boolean, InvalidNameError | StoreError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SecretStore") {}

export const use = serviceUse(Service)

const Sealed = Schema.Struct({
  nonce: Schema.String,
  ciphertext: Schema.String,
  tag: Schema.String,
  updated: Schema.Number,
})
type Sealed = Schema.Schema.Type<typeof Sealed>

const StoreFile = Schema.Struct({
  version: Schema.Literal(VERSION),
  entries: Schema.Record(Schema.String, Sealed),
})

const decodeStoreFile = Schema.decodeUnknownOption(Schema.fromJsonString(StoreFile))

const CIPHER = "aes-256-gcm"
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

export const layerAt = (input: Paths) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const flock = yield* EffectFlock.Service
      const lockKey = `secret-store:${input.store}`

      const missing = <A>(effect: Effect.Effect<A, FSUtil.Error>) =>
        effect.pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
          Effect.orDie,
        )

      // Directories get 0700 and files 0600 when they are created; the file is
      // complete before it appears under its final name.
      const writePrivate = Effect.fnUntraced(function* (file: string, data: string | Uint8Array, exclusive: boolean) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true, mode: 0o700 }).pipe(Effect.orDie)
        const tmp = `${file}.${randomUUID()}.tmp`
        const options = { flag: "wx", mode: 0o600 } as const
        yield* (typeof data === "string" ? fs.writeFileString(tmp, data, options) : fs.writeFile(tmp, data, options)).pipe(
          Effect.orDie,
        )
        const publish = exclusive ? fs.link(tmp, file) : fs.rename(tmp, file)
        return yield* publish.pipe(
          Effect.as(true),
          Effect.catchIf(
            (error) => exclusive && error.reason._tag === "AlreadyExists",
            () => Effect.succeed(false),
          ),
          Effect.ensuring(exclusive ? fs.remove(tmp).pipe(Effect.ignore) : Effect.void),
          Effect.onError(() => fs.remove(tmp).pipe(Effect.ignore)),
          Effect.orDie,
        )
      })

      const readStore = Effect.fnUntraced(function* () {
        const text = yield* missing(fs.readFileString(input.store))
        if (text === undefined) return { version: VERSION, entries: {} as Record<string, Sealed> }
        return yield* Option.match(decodeStoreFile(text), {
          onNone: () => Effect.fail(new StoreError({ path: input.store })),
          onSome: (data) => Effect.succeed({ version: data.version, entries: { ...data.entries } }),
        })
      })

      const writeStore = (entries: Record<string, Sealed>) =>
        writePrivate(input.store, JSON.stringify({ version: VERSION, entries }, null, 2), false)

      const readKey = Effect.fnUntraced(function* (create: boolean) {
        const bytes = yield* missing(fs.readFile(input.key))
        if (bytes) return yield* checkKey(bytes, input.key)
        if (!create) return yield* new KeyError({ reason: "missing", path: input.key })
        yield* writePrivate(input.key, randomBytes(KEY_BYTES), true)
        return yield* checkKey(yield* fs.readFile(input.key).pipe(Effect.orDie), input.key)
      })

      const requireName = (name: string) =>
        valid(name) ? Effect.succeed(name) : Effect.fail(new InvalidNameError({ secret: name }))

      const set = Effect.fn("SecretStore.set")(function* (name: string, value: string) {
        yield* requireName(name)
        yield* Effect.gen(function* () {
          const key = yield* readKey(true)
          const current = yield* readStore()
          const sealed = seal(key, name, value, yield* Clock.currentTimeMillis)
          yield* writeStore({ ...current.entries, [name]: sealed })
        }).pipe(flock.withLock(lockKey), Effect.catchTag(["LockTimeoutError", "LockCompromisedError"], Effect.die))
      })

      const get = Effect.fn("SecretStore.get")(function* (name: string) {
        yield* requireName(name)
        const current = yield* readStore()
        const sealed = Object.hasOwn(current.entries, name) ? current.entries[name] : undefined
        if (!sealed) return yield* new NotFoundError({ secret: name })
        const key = yield* readKey(false)
        return yield* open(key, name, sealed)
      })

      const list = Effect.fn("SecretStore.list")(function* () {
        const current = yield* readStore()
        return Object.entries(current.entries)
          .map(([name, sealed]) => ({ name, updated: sealed.updated }))
          .sort((a, b) => a.name.localeCompare(b.name))
      })

      const remove = Effect.fn("SecretStore.delete")(function* (name: string) {
        yield* requireName(name)
        return yield* Effect.gen(function* () {
          const current = yield* readStore()
          if (!Object.hasOwn(current.entries, name)) return false
          yield* writeStore(Object.fromEntries(Object.entries(current.entries).filter(([item]) => item !== name)))
          return true
        }).pipe(flock.withLock(lockKey), Effect.catchTag(["LockTimeoutError", "LockCompromisedError"], Effect.die))
      })

      return Service.of({ set, get, list, delete: remove })
    }),
  )

export const nodeAt = (input: Paths) =>
  makeGlobalNode({
    service: Service,
    layer: layerAt(input),
    deps: [FSUtil.node, EffectFlock.node],
  })

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.unwrap(Effect.sync(() => layerAt(paths()))),
  deps: [FSUtil.node, EffectFlock.node],
})

function checkKey(bytes: Uint8Array, file: string) {
  if (bytes.length !== KEY_BYTES) return Effect.fail(new KeyError({ reason: "invalid", path: file }))
  return Effect.succeed(Buffer.from(bytes))
}

// The name and the store version are authenticated with every entry, so an
// entry copied under another name or into another store version fails to open.
function aad(name: string) {
  return Buffer.from(`void-secret:v${VERSION}:${name}`, "utf8")
}

function seal(key: Buffer, name: string, value: string, updated: number): Sealed {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(CIPHER, key, nonce, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad(name))
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return {
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    updated,
  }
}

function open(key: Buffer, name: string, sealed: Sealed) {
  return Effect.try({
    try: () => {
      const nonce = Buffer.from(sealed.nonce, "base64")
      const tag = Buffer.from(sealed.tag, "base64")
      if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) throw new Error("malformed entry")
      const decipher = createDecipheriv(CIPHER, key, nonce, { authTagLength: TAG_BYTES })
      decipher.setAAD(aad(name))
      decipher.setAuthTag(tag)
      const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()])
      return Redacted.make(plain.toString("utf8"), { label: name })
    },
    catch: () => new DecryptError({ secret: name }),
  })
}
