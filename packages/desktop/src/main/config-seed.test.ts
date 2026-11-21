import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyEdits, modify, parse } from "jsonc-parser"
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
  data = await mkdtemp(join(tmpdir(), "void-config-data-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})

const read = async () => readFile(join(dir, "opencode.jsonc"), "utf8")
const remove = (text: string, path: string[]) => applyEdits(text, modify(text, path, undefined, {}))
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

describe("seedConfig agents", () => {
  const agents = async () => parse(await read()).agent
  const auth = async (providers: string[]) => {
    const file = join(dir, "auth.json")
    await writeFile(file, JSON.stringify(Object.fromEntries(providers.map((id) => [id, { type: "api", key: "x" }]))))
    return file
  }

  test("puts main on a connected provider with tool calls and the worker on the subscription", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, data, wrapper, await auth(["subscription", "openai"]))

    expect(await agents()).toEqual({
      main: { model: "openai/gpt-6.2-sol", variant: "medium" },
      worker: { model: "subscription/sonnet", variant: "medium" },
    })
  })

  test("prefers anthropic, then openai, google and github-copilot for main", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, await auth(["github-copilot", "google", "openai", "anthropic"]))
    expect((await agents()).main).toEqual({ model: "anthropic/claude-sonnet-5-5", variant: "medium" })

    await rm(join(data, "main-seeded-1"))
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, await auth(["github-copilot", "google"]))
    expect((await agents()).main).toEqual({ model: "google/gemini-4-neon" })

    await rm(join(data, "main-seeded-1"))
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, await auth(["subscription", "github-copilot"]))
    expect((await agents()).main).toEqual({ model: "github-copilot/gpt-6.2-sol", variant: "medium" })
  })

  test("leaves main unset until a provider with tool calls is connected", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)

    await seedConfig(dir, data, wrapper, await auth(["subscription"]))

    expect(await agents()).toEqual({ worker: { model: "subscription/sonnet", variant: "medium" } })
    expect(await Bun.file(join(data, "main-seeded-1")).exists()).toBe(false)

    await writeFile(join(dir, "opencode.jsonc"), remove(await read(), ["agent", "worker", "variant"]))
    await seedConfig(dir, data, wrapper, await auth(["subscription", "openai"]))

    expect(await agents()).toEqual({
      main: { model: "openai/gpt-6.2-sol", variant: "medium" },
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

    await seedConfig(dir, data, wrapper, await auth(["openai"]))

    expect(await agents()).toEqual({
      main: { model: "anthropic/x", steps: 3 },
      worker: { model: "subscription/sonnet", variant: "low" },
    })
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
  test("keeps keys the owner removed on later launches", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, join(dir, "missing.json"))
    expect(await Bun.file(join(data, "config-seeded-1")).exists()).toBe(true)

    const removed = [
      ["agent", "worker", "model"],
      ["provider", "subscription", "models", "opus", "variants", "max"],
      ["provider", "subscription", "options", "defaultSettings", "permissionMode"],
    ].reduce(remove, await read())
    await writeFile(join(dir, "opencode.jsonc"), removed)

    await seedConfig(dir, data, wrapper, join(dir, "missing.json"))

    expect(await read()).toBe(removed)
  })

  test("skips a malformed config and seeds it once it parses", async () => {
    const broken = config.replace('"mcp":', '"mcp"')
    await writeFile(join(dir, "opencode.jsonc"), broken)

    await seedConfig(dir, data, wrapper)

    expect(await read()).toBe(broken)
    expect(await Bun.file(join(data, "config-seeded-1")).exists()).toBe(false)

    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper)

    expect((await settings()).permissionMode).toBe("bypassPermissions")
  })

  test("writes no stamp while the subscription provider is missing", async () => {
    await writeFile(join(dir, "opencode.jsonc"), '{ "shell": "zsh" }')

    await seedConfig(dir, data, wrapper)

    expect(await Bun.file(join(data, "config-seeded-1")).exists()).toBe(false)
  })
})
