import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { ensureDefaultSpaces, seedSpace, type SpaceTemplates } from "./space-defaults"
import { listSpaces, spaceDir } from "./spaces"

let root: string
let legacy: string

const templates: SpaceTemplates = {
  personal: { class: "personal", sessionMode: "isolated", color: "#4f8cff" },
  company: { class: "company", sessionMode: "user", color: "#d9822b" },
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-defaults-"))
  legacy = await mkdtemp(join(tmpdir(), "void-legacy-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(legacy, { recursive: true, force: true })
})

async function oldSpace(dir: string, value: unknown) {
  await mkdir(join(legacy, dir), { recursive: true })
  await writeFile(join(legacy, dir, "space.json"), JSON.stringify(value))
}

describe("default spaces", () => {
  test("creates home, void and a work space when the old runtime has no company space", async () => {
    await oldSpace("home", { id: "home", name: "Home", class: "personal", sessionMode: "isolated" })
    await ensureDefaultSpaces(root, templates, legacy)
    const spaces = await listSpaces(root)
    expect(spaces.map((space) => [space.id, space.name, space.class, space.sessionMode])).toEqual([
      ["home", "Home", "personal", "isolated"],
      ["void", "VOID", "personal", "isolated"],
      ["work", "Work", "company", "user"],
    ])
  })

  test("takes the id and name of the work space from the old runtime", async () => {
    await oldSpace("alpha", { id: "alpha-team", name: "Alpha Team", class: "company", sessionMode: "user" })
    await oldSpace("p", { id: "pers", name: "P", class: "personal", sessionMode: "isolated" })
    await ensureDefaultSpaces(root, templates, legacy)
    const spaces = await listSpaces(root)
    expect(spaces.map((space) => space.id)).toEqual(["alpha-team", "home", "void"])
    expect(spaces[0]).toMatchObject({ name: "Alpha Team", class: "company", sessionMode: "user", color: "#d9822b" })
  })

  test("falls back to work when the old runtime file is unusable", async () => {
    await oldSpace("bad", { id: "Bad Id", name: "X", class: "company" })
    await ensureDefaultSpaces(root, templates, join(legacy, "missing"))
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["home", "void", "work"])
  })

  test("is idempotent and does not create a second company space", async () => {
    await oldSpace("a", { id: "alpha", name: "Alpha", class: "company", sessionMode: "user" })
    await ensureDefaultSpaces(root, templates, legacy)
    await oldSpace("a", { id: "beta", name: "Beta", class: "company", sessionMode: "user" })
    await ensureDefaultSpaces(root, templates, legacy)
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["alpha", "home", "void"])
  })

  test("never writes into the old runtime", async () => {
    await oldSpace("a", { id: "alpha", name: "Alpha", class: "company", sessionMode: "user" })
    const before = await readFile(join(legacy, "a", "space.json"), "utf8")
    await ensureDefaultSpaces(root, templates, legacy)
    expect(await readFile(join(legacy, "a", "space.json"), "utf8")).toBe(before)
    expect(existsSync(join(legacy, "alpha"))).toBe(false)
  })
})

describe("space seeder", () => {
  const seed = {
    agents: [{ name: "main", content: "m" }],
    wrapper: "export default 1",
  }

  test("seeds the config dir of the space and keeps the stamps in the space state dir", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", seed)
    const dir = spaceDir(root, "void")
    expect(await readFile(join(dir, "config", "opencode", "agents", "main.md"), "utf8")).toBe("m")
    expect(await readFile(join(dir, "config", "opencode", "provider", "subscription.mjs"), "utf8")).toBe(seed.wrapper)
    expect(existsSync(join(dir, "state", "agents-seeded"))).toBe(true)
    expect(existsSync(join(spaceDir(root, "work"), "config", "opencode"))).toBe(false)
  })

  test("seeds once per space", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    await seedSpace(root, "void", seed)
    const stamp = join(spaceDir(root, "void"), "state", "agents-seeded")
    const first = (await stat(stamp)).mtimeMs
    await seedSpace(root, "void", { ...seed, agents: [{ name: "main", content: "changed" }] })
    expect((await stat(stamp)).mtimeMs).toBe(first)
    expect(await readFile(join(spaceDir(root, "void"), "config", "opencode", "agents", "main.md"), "utf8")).toBe("m")
  })

  test("puts the sign-in plugin and the provider entry into a space without a config", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    const config = '{"provider":{"subscription":{"models":{}}}}'
    await seedSpace(root, "work", { ...seed, plugin: "export default {}", config })
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    expect(await readFile(join(dir, "plugins", "subscription-auth.js"), "utf8")).toBe("export default {}")
    const written = parse(await readFile(join(dir, "opencode.jsonc"), "utf8"))
    expect(written.provider.subscription.models).toEqual({})
  })

  test("keeps an existing config", async () => {
    await ensureDefaultSpaces(root, templates, legacy)
    const dir = join(spaceDir(root, "work"), "config", "opencode")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "opencode.jsonc"), "{}")
    await seedSpace(root, "work", { ...seed, plugin: "p", config: '{"provider":{}}' })
    expect(await readFile(join(dir, "opencode.jsonc"), "utf8")).toBe("{}")
  })
})
