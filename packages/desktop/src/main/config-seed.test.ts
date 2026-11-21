import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { seedConfig } from "./config-seed"

const wrapper = "export function createSubscription() {}\n"

const config = `{
  // providers the app shows
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "subscription": {
      "npm": "file://{env:HOME}/void/config/opencode/provider/subscription.mjs",
      "options": {
        "defaultSettings": {
          "settingSources": []
        }
      },
      "models": {
        "opus": { "name": "Opus" },
        "sonnet": { "name": "Sonnet" }
      }
    }
  },
  "mcp": { "hub": { "type": "local", "command": ["hub"] } }
}
`

let dir = ""
let data = ""

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "void-config-"))
  data = await mkdtemp(join(tmpdir(), "void-data-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})

const read = async () => readFile(join(dir, "opencode.jsonc"), "utf8")
const settings = async () => parse(await read()).provider.subscription.options.defaultSettings

describe("seedConfig wrapper", () => {
  test("writes the bundled wrapper when it is missing", async () => {
    await seedConfig(dir, data, wrapper)

    expect(await readFile(join(dir, "provider", "subscription.mjs"), "utf8")).toBe(wrapper)
  })

  test("replaces a wrapper that differs from the bundled one", async () => {
    await mkdir(join(dir, "provider"), { recursive: true })
    await writeFile(join(dir, "provider", "subscription.mjs"), "old")

    await seedConfig(dir, data, wrapper)

    expect(await readFile(join(dir, "provider", "subscription.mjs"), "utf8")).toBe(wrapper)
  })

  test("leaves a wrapper that matches the bundled one", async () => {
    await mkdir(join(dir, "provider"), { recursive: true })
    await writeFile(join(dir, "provider", "subscription.mjs"), wrapper)
    const before = (await stat(join(dir, "provider", "subscription.mjs"))).mtimeMs
    await Bun.sleep(20)

    await seedConfig(dir, data, wrapper)

    expect((await stat(join(dir, "provider", "subscription.mjs"))).mtimeMs).toBe(before)
  })
})

describe("seedConfig opencode.jsonc", () => {
  test("lets the subscription run tools without asking when the settings lack a mode", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, data, wrapper)

    expect(await settings()).toEqual({
      settingSources: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    })
  })

  test("keeps existing values, other keys and comments", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace('"settingSources": []', '"settingSources": [],\n          "permissionMode": "default"'),
    )

    await seedConfig(dir, data, wrapper)

    const text = await read()
    expect(text).toContain("// providers the app shows")
    expect(parse(text).mcp).toEqual({ hub: { type: "local", command: ["hub"] } })
    expect(await settings()).toEqual({
      settingSources: [],
      permissionMode: "default",
      allowDangerouslySkipPermissions: true,
    })
  })

  test("does not rewrite a config that has every key", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper)
    const seeded = await read()

    await seedConfig(dir, data, wrapper)

    expect(await read()).toBe(seeded)
  })

  test("leaves a config without the subscription provider and creates none", async () => {
    await seedConfig(dir, data, wrapper)
    expect(await Bun.file(join(dir, "opencode.jsonc")).exists()).toBe(false)

    await writeFile(join(dir, "opencode.jsonc"), '{ "shell": "zsh" }')
    await seedConfig(dir, data, wrapper)
    expect(await read()).toBe('{ "shell": "zsh" }')
  })
})

describe("seedConfig effort variants", () => {
  const efforts = Object.fromEntries(["low", "medium", "high", "xhigh", "max"].map((name) => [name, { effort: name }]))
  const models = async () => parse(await read()).provider.subscription.models

  test("gives every subscription model the effort variants", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, data, wrapper)

    expect(await models()).toEqual({
      opus: { name: "Opus", variants: efforts },
      sonnet: { name: "Sonnet", variants: efforts },
    })
  })

  test("keeps variants a model already has", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace(
        '"sonnet": { "name": "Sonnet" }',
        '"sonnet": { "name": "Sonnet", "variants": { "high": { "effort": "max" }, "fast": {} } }',
      ),
    )

    await seedConfig(dir, data, wrapper)

    expect((await models()).sonnet.variants).toEqual({ ...efforts, high: { effort: "max" }, fast: {} })
  })
})

describe("seedConfig once", () => {
  test("does not put back values the owner removed after the first seed", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper)
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, data, wrapper)

    expect(await read()).toBe(config)
  })
})
