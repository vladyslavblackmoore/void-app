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
      haiku: { name: "Haiku", variants: efforts },
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

describe("seedConfig templates", () => {
  test("writes the plugin and a config only when none exists", async () => {
    await seedConfig(dir, data, wrapper, { plugin: "plugin", config })

    expect(await readFile(join(dir, "plugins", "subscription-auth.js"), "utf8")).toBe("plugin")
    expect(parse(await read()).provider.subscription.models.opus.name).toBe("Opus")

    await writeFile(join(dir, "opencode.jsonc"), '{ "shell": "zsh" }')
    await seedConfig(dir, data, wrapper, { config })
    expect(await read()).toBe('{ "shell": "zsh" }')
  })
})

describe("seedConfig memory", () => {
  const memory = "/home/u/void/memory"
  const files = ["MEMORY.md", "tasks.md", "RULES.md"].map((name) => `${memory}/${name}`)
  const parsed = async () => parse(await read())

  test("adds the memory permission and directory to an already stamped config", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper)
    await rm(join(data, "config-seeded-2"), { force: true })

    await seedConfig(dir, data, wrapper, {}, memory)

    const result = await parsed()
    expect(result.instructions).toBeUndefined()
    expect(result.permission.external_directory).toEqual({ [`${memory}/*`]: "allow" })
    expect(result.provider.subscription.options.defaultSettings.additionalDirectories).toEqual([memory])
    expect(result.mcp).toEqual({ hub: { type: "local", command: ["hub"] } })
    expect(await read()).toContain("// providers the app shows")
  })

  test("merges into existing permission without duplicates and drops the memory instructions", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace(
        '"mcp"',
        `"instructions": ["docs/RULES.md", "${files[0]}"], "permission": { "external_directory": { "/tmp/*": "allow" }, "bash": "ask" }, "mcp"`,
      ),
    )

    await seedConfig(dir, data, wrapper, {}, memory)

    const result = await parsed()
    expect(result.instructions).toEqual(["docs/RULES.md"])
    expect(result.permission).toEqual({
      external_directory: { "/tmp/*": "allow", [`${memory}/*`]: "allow" },
      bash: "ask",
    })
  })

  test("is idempotent and does not restore keys the owner removed", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, {}, memory)
    const seeded = await read()
    await seedConfig(dir, data, wrapper, {}, memory)
    expect(await read()).toBe(seeded)

    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper, {}, memory)
    expect(await read()).toBe(config)
  })

  test("keeps a permission the owner set for the memory directory", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace('"mcp"', `"permission": { "external_directory": { "${memory}/*": "ask" } }, "mcp"`),
    )

    await seedConfig(dir, data, wrapper, {}, memory)

    expect((await parsed()).permission.external_directory[`${memory}/*`]).toBe("ask")
  })

  test("a fresh install gets the memory keys from the template", async () => {
    await seedConfig(dir, data, wrapper, { config }, memory)

    expect((await parsed()).instructions).toBeUndefined()
  })
})

describe("seedConfig haiku model", () => {
  const efforts = ["low", "medium", "high", "xhigh", "max"]
  const models = async () => parse(await read()).provider.subscription.models

  test("adds haiku with the effort variants to an existing config once", async () => {
    await writeFile(join(dir, "opencode.jsonc"), config)
    await writeFile(join(data, "config-seeded-1"), "")

    await seedConfig(dir, data, wrapper)

    const haiku = (await models()).haiku
    expect(haiku.name).toBe("Haiku")
    expect(Object.keys(haiku.variants)).toEqual(efforts)
    expect(haiku.variants.xhigh).toEqual({ effort: "xhigh" })
    expect(await Bun.file(join(data, "config-seeded-3")).exists()).toBe(true)

    const seeded = await read()
    await seedConfig(dir, data, wrapper)
    expect(await read()).toBe(seeded)
  })

  test("does not overwrite a haiku entry that exists and does not restore a removed one", async () => {
    await writeFile(
      join(dir, "opencode.jsonc"),
      config.replace(
        '"sonnet": { "name": "Sonnet" }',
        '"sonnet": { "name": "Sonnet" }, "haiku": { "name": "Mine", "variants": { "low": { "effort": "low" } } }',
      ),
    )
    await writeFile(join(data, "config-seeded-1"), "")

    await seedConfig(dir, data, wrapper)

    const haiku = (await models()).haiku
    expect(haiku.name).toBe("Mine")
    expect(Object.keys(haiku.variants)).toEqual(["low", "medium", "high", "xhigh", "max"])

    await writeFile(join(dir, "opencode.jsonc"), config)
    await seedConfig(dir, data, wrapper)
    expect((await models()).haiku).toBeUndefined()
  })

  test("a fresh install ends with one haiku entry carrying the variants", async () => {
    const template = await Bun.file(join(import.meta.dir, "../../resources/config/opencode.jsonc")).text()

    await seedConfig(dir, data, wrapper, { config: template })

    const haiku = (await models()).haiku
    expect(haiku.name).toBe("Haiku")
    expect(Object.keys(haiku.variants)).toEqual(efforts)
  })

  test("seeds the delegate files next to the plugin and the provider", async () => {
    await seedConfig(dir, data, wrapper, { delegate: { plugin: "p", core: "c", mcp: "m" } })

    expect(await readFile(join(dir, "plugins", "delegate.js"), "utf8")).toBe("p")
    expect(await readFile(join(dir, "delegate", "core.mjs"), "utf8")).toBe("c")
    expect(await readFile(join(dir, "delegate", "mcp.mjs"), "utf8")).toBe("m")
  })

  describe("injection migration", () => {
    const delegate = { plugin: "p", core: "c", mcp: "m", manager: "rules", memory: "mem" }
    const memory = "/home/u/void/memory"
    const manager = () => join(dir, "delegate", "manager.md")
    const instructions = async () => parse(await read()).instructions

    test("writes the rules, the memory module and the memory path next to the plugin", async () => {
      await seedConfig(dir, data, wrapper, { delegate }, memory)

      expect(await readFile(manager(), "utf8")).toBe("rules")
      expect(await readFile(join(dir, "delegate", "memory.mjs"), "utf8")).toBe("mem")
      expect(JSON.parse(await readFile(join(dir, "delegate", "paths.json"), "utf8"))).toEqual({ memoryDir: memory })
    })

    test("removes the manager and memory entries and keeps the others", async () => {
      const entries = [manager(), "docs/RULES.md", `${memory}/MEMORY.md`, `${memory}/tasks.md`, `${memory}/RULES.md`]
      await writeFile(
        join(dir, "opencode.jsonc"),
        config.replace('"mcp"', `"instructions": ${JSON.stringify(entries)}, "mcp"`),
      )

      await seedConfig(dir, data, wrapper, { delegate }, memory)

      expect(await instructions()).toEqual(["docs/RULES.md"])
      expect(await read()).toContain("// providers the app shows")
    })

    test("removes the entries from a config without the subscription provider", async () => {
      await writeFile(
        join(dir, "opencode.jsonc"),
        `{ "instructions": ["${manager()}", "${memory}/tasks.md", "keep.md"] }\n`,
      )

      await seedConfig(dir, data, wrapper, { delegate }, memory)

      expect(await instructions()).toEqual(["keep.md"])
    })

    test("drops the instructions key when nothing else is left", async () => {
      await writeFile(
        join(dir, "opencode.jsonc"),
        config.replace('"mcp"', `"instructions": ["${manager()}", "${memory}/tasks.md"], "mcp"`),
      )

      await seedConfig(dir, data, wrapper, { delegate }, memory)

      expect(await instructions()).toBeUndefined()
    })

    test("runs once and does not touch entries the owner adds later", async () => {
      await writeFile(join(dir, "opencode.jsonc"), config)
      await seedConfig(dir, data, wrapper, { delegate }, memory)
      const added = config.replace('"mcp"', `"instructions": ["${manager()}"], "mcp"`)
      await writeFile(join(dir, "opencode.jsonc"), added)

      await seedConfig(dir, data, wrapper, { delegate }, memory)

      expect(await read()).toBe(added)
    })

    test("leaves a config without instructions unchanged", async () => {
      await writeFile(join(dir, "opencode.jsonc"), config)

      await seedConfig(dir, data, wrapper, { delegate: { plugin: "p", core: "c", mcp: "m" } })

      expect(await instructions()).toBeUndefined()
    })

    test("refreshes a changed rules file", async () => {
      await seedConfig(dir, data, wrapper, { delegate }, memory)

      await seedConfig(dir, data, wrapper, { delegate: { ...delegate, manager: "new rules" } }, memory)

      expect(await readFile(manager(), "utf8")).toBe("new rules")
    })
  })
})
