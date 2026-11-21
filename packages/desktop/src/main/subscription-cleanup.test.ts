import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanSubscriptionInSpaces } from "./subscription-cleanup"
import { ensureDefaultSpaces, seedSpace, type SpaceTemplates } from "./space-defaults"
import { spaceDir } from "./spaces"

const STAMP = "subscription-cleaned-1"
const stale = { type: "oauth", key: "subscription", metadata: { configDir: "/legacy/cli" } }
const other = { type: "api", key: "other-key" }

const templates: SpaceTemplates = {
  personal: { class: "personal", sessionMode: "isolated", color: "#4f8cff" },
  company: { class: "company", sessionMode: "user", color: "#d9822b" },
}

let root = ""

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-cleanup-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function space(id: string, auth: unknown) {
  const dir = spaceDir(root, id)
  const config = join(dir, "config", "opencode")
  await mkdir(join(config, "plugin"), { recursive: true })
  await mkdir(join(config, "plugins"), { recursive: true })
  await mkdir(join(dir, "data", "opencode"), { recursive: true })
  await mkdir(join(dir, "state"), { recursive: true })
  await writeFile(join(dir, "space.json"), JSON.stringify({ id, name: id, class: "personal", sessionMode: "isolated", color: "#4f8cff" }))
  await writeFile(join(config, "plugin", "subscription-auth.js"), "old")
  await writeFile(join(config, "plugin", "keep.js"), "keep")
  await writeFile(join(config, "plugins", "subscription-auth.js"), "current")
  await writeFile(join(config, "opencode.jsonc"), "{}")
  await writeFile(join(dir, "data", "opencode", "auth.json"), JSON.stringify(auth), { mode: 0o600 })
  return dir
}

const auth = async (dir: string) => JSON.parse(await readFile(join(dir, "data", "opencode", "auth.json"), "utf8"))

describe("subscription cleanup", () => {
  test("removes the old plugin copy and the stale entry and writes the stamp", async () => {
    const dir = await space("home", { subscription: stale, other })
    await cleanSubscriptionInSpaces(root)

    const config = join(dir, "config", "opencode")
    expect(existsSync(join(config, "plugin", "subscription-auth.js"))).toBe(false)
    expect(await readFile(join(config, "plugin", "keep.js"), "utf8")).toBe("keep")
    expect(await readFile(join(config, "plugins", "subscription-auth.js"), "utf8")).toBe("current")
    expect(await readFile(join(config, "opencode.jsonc"), "utf8")).toBe("{}")
    expect(await auth(dir)).toEqual({ other })
    expect(existsSync(join(dir, "state", STAMP))).toBe(true)
    expect((await stat(join(dir, "data", "opencode", "auth.json"))).mode & 0o777).toBe(0o600)
  })

  test("keeps an entry that points at the space own cli dir", async () => {
    const own = { type: "oauth", key: "subscription", metadata: { configDir: join(spaceDir(root, "home"), "cli") } }
    const dir = await space("home", { subscription: own, other })
    await cleanSubscriptionInSpaces(root)

    expect(await auth(dir)).toEqual({ subscription: own, other })
    expect(existsSync(join(dir, "config", "opencode", "plugin", "subscription-auth.js"))).toBe(false)
  })

  test("does nothing the second time", async () => {
    const dir = await space("home", { subscription: stale, other })
    await cleanSubscriptionInSpaces(root)
    await writeFile(join(dir, "config", "opencode", "plugin", "subscription-auth.js"), "again")
    await writeFile(join(dir, "data", "opencode", "auth.json"), JSON.stringify({ subscription: stale }))
    await cleanSubscriptionInSpaces(root)

    expect(await readFile(join(dir, "config", "opencode", "plugin", "subscription-auth.js"), "utf8")).toBe("again")
    expect(await auth(dir)).toEqual({ subscription: stale })
  })

  test("covers every space and tolerates a space without auth file", async () => {
    const home = await space("home", { subscription: stale })
    const work = await space("work", { other })
    await rm(join(work, "data", "opencode", "auth.json"))
    await cleanSubscriptionInSpaces(root)

    expect(await auth(home)).toEqual({})
    expect(existsSync(join(work, "config", "opencode", "plugin", "subscription-auth.js"))).toBe(false)
    expect(existsSync(join(work, "state", STAMP))).toBe(true)
  })

  test("leaves an unreadable auth file alone and does not stamp", async () => {
    const dir = await space("home", {})
    await writeFile(join(dir, "data", "opencode", "auth.json"), "not json")
    await cleanSubscriptionInSpaces(root)

    expect(await readFile(join(dir, "data", "opencode", "auth.json"), "utf8")).toBe("not json")
    expect(existsSync(join(dir, "state", STAMP))).toBe(false)
  })
})

describe("fresh seed", () => {
  test("writes the plugin only under plugins", async () => {
    await mkdir(spaceDir(root, "home"), { recursive: true })
    await seedSpace(root, "home", { agents: [], wrapper: "w", plugin: "p" })
    const config = join(spaceDir(root, "home"), "config", "opencode")

    expect(await readFile(join(config, "plugins", "subscription-auth.js"), "utf8")).toBe("p")
    expect(existsSync(join(config, "plugin"))).toBe(false)
  })
})

describe("startup", () => {
  test("ensureDefaultSpaces cleans an existing space", async () => {
    const dir = await space("home", { subscription: stale, other })
    await ensureDefaultSpaces(root, templates, join(root, "none"))

    expect(existsSync(join(dir, "config", "opencode", "plugin", "subscription-auth.js"))).toBe(false)
    expect(await auth(dir)).toEqual({ other })
  })
})
