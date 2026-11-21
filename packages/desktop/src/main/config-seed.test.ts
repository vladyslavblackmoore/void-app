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

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "void-config-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const read = async () => readFile(join(dir, "opencode.jsonc"), "utf8")
const settings = async () => parse(await read()).provider.subscription.options.defaultSettings

describe("seedConfig wrapper", () => {
  test("writes the bundled wrapper when it is missing", async () => {
    await seedConfig(dir, wrapper)

    expect(await readFile(join(dir, "provider", "subscription.mjs"), "utf8")).toBe(wrapper)
  })

  test("replaces a wrapper that differs from the bundled one", async () => {
    await mkdir(join(dir, "provider"), { recursive: true })
    await writeFile(join(dir, "provider", "subscription.mjs"), "old")

    await seedConfig(dir, wrapper)

    expect(await readFile(join(dir, "provider", "subscription.mjs"), "utf8")).toBe(wrapper)
  })

  test("leaves a wrapper that matches the bundled one", async () => {
    await mkdir(join(dir, "provider"), { recursive: true })
    await writeFile(join(dir, "provider", "subscription.mjs"), wrapper)
    const before = (await stat(join(dir, "provider", "subscription.mjs"))).mtimeMs
    await Bun.sleep(20)

    await seedConfig(dir, wrapper)

    expect((await stat(join(dir, "provider", "subscription.mjs"))).mtimeMs).toBe(before)
  })
})

describe("seedConfig opencode.jsonc", () => {
  test("lets the subscription run tools without asking when the settings lack a mode", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, wrapper)

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

    await seedConfig(dir, wrapper)

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
    await seedConfig(dir, wrapper)
    const seeded = await read()

    await seedConfig(dir, wrapper)

    expect(await read()).toBe(seeded)
  })

  test("leaves a config without the subscription provider and creates none", async () => {
    await seedConfig(dir, wrapper)
    expect(await Bun.file(join(dir, "opencode.jsonc")).exists()).toBe(false)

    await writeFile(join(dir, "opencode.jsonc"), '{ "shell": "zsh" }')
    await seedConfig(dir, wrapper)
    expect(await read()).toBe('{ "shell": "zsh" }')
  })
})

describe("seedConfig agents", () => {
  const agents = async () => parse(await read()).agent
  const auth = async (providers: string[]) => {
    const file = join(dir, "auth.json")
    await writeFile(file, JSON.stringify(Object.fromEntries(providers.map((id) => [id, { type: "api", key: "x" }]))))
    return file
  }

  test("puts main on a connected provider with tool calls and the worker on the subscription", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, wrapper, await auth(["subscription", "openai"]))

    expect(await agents()).toEqual({
      main: { model: "openai/gpt-6.2-sol", variant: "medium" },
      worker: { model: "subscription/sonnet" },
    })
  })

  test("keeps main on the subscription when no provider with tool calls is connected", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, wrapper, join(dir, "missing.json"))

    expect(await agents()).toEqual({
      main: { model: "subscription/opus" },
      worker: { model: "subscription/sonnet" },
    })
  })

  test("keeps the model, variant and other settings an agent already has", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace(
        '"mcp":',
        '"agent": { "main": { "model": "anthropic/x", "steps": 3 }, "worker": { "variant": "low" } },\n  "mcp":',
      ),
    )

    await seedConfig(dir, wrapper, await auth(["openai"]))

    expect(await agents()).toEqual({
      main: { model: "anthropic/x", steps: 3 },
      worker: { model: "subscription/sonnet", variant: "low" },
    })
  })
})
