import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LEGACY_CLI_DIR, createSpace, ensureHomeSpace, isSpaceId, listSpaces, spaceDir } from "./spaces"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-spaces-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const valid = { id: "work", name: "Work", class: "company", sessionMode: "user", color: "#336699" }

async function put(path: string, content: string) {
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, content)
}

async function files(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(dir, entry.name), base) : Promise.resolve([join(dir, entry.name).slice(base.length + 1)]),
    ),
  )
  return nested.flat().sort()
}

describe("space ids", () => {
  test("accepts lowercase letters, digits and hyphen", () => {
    expect(isSpaceId("home")).toBe(true)
    expect(isSpaceId("work-2")).toBe(true)
  })

  test("rejects machine, empty, uppercase, dots and separators", () => {
    for (const id of ["machine", "", "Home", "a.b", "a/b", "..", "a b", "-x", "a_b"]) expect(isSpaceId(id)).toBe(false)
  })
})

describe("space registry", () => {
  test("lists valid spaces sorted by id and skips invalid files", async () => {
    await put(join(root, "spaces", "work", "space.json"), JSON.stringify(valid))
    await put(join(root, "spaces", "home", "space.json"), JSON.stringify({ ...valid, id: "home", roots: ["/a"] }))
    await put(join(root, "spaces", "broken", "space.json"), "{nope")
    await put(join(root, "spaces", "badclass", "space.json"), JSON.stringify({ ...valid, id: "badclass", class: "x" }))
    await put(join(root, "spaces", "machine", "space.json"), JSON.stringify({ ...valid, id: "machine" }))
    await put(join(root, "spaces", "other", "space.json"), JSON.stringify({ ...valid, id: "mismatch" }))
    await put(join(root, "spaces", "badroots", "space.json"), JSON.stringify({ ...valid, id: "badroots", roots: [1] }))
    await mkdir(join(root, "spaces", "empty"), { recursive: true })
    const spaces = await listSpaces(root)
    expect(spaces.map((space) => space.id)).toEqual(["home", "work"])
    expect(spaces[0].roots).toEqual(["/a"])
    expect(spaces[1].roots).toBeUndefined()
  })

  test("returns an empty list when the root has no spaces", async () => {
    expect(await listSpaces(root)).toEqual([])
  })
})

describe("space creation", () => {
  test("creates the tree with private modes and writes space.json last", async () => {
    const space = await createSpace(root, valid as never)
    expect(space.id).toBe("work")
    const dir = spaceDir(root, "work")
    for (const name of ["data", "config", "state", "cli"]) {
      expect((await stat(join(dir, name))).mode & 0o777).toBe(0o700)
    }
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
    expect((await stat(join(dir, "space.json"))).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(join(dir, "space.json"), "utf8"))).toEqual(valid)
    expect((await readdir(dir)).sort()).toEqual(["cli", "config", "data", "space.json", "state"])
  })

  test("rejects invalid input without creating anything", async () => {
    await expect(createSpace(root, { ...valid, id: "machine" } as never)).rejects.toThrow()
    await expect(createSpace(root, { ...valid, class: "x" } as never)).rejects.toThrow()
    expect(existsSync(join(root, "spaces"))).toBe(false)
  })

  test("rejects an existing space", async () => {
    await createSpace(root, valid as never)
    await expect(createSpace(root, valid as never)).rejects.toThrow()
    expect(await listSpaces(root)).toHaveLength(1)
  })

  test("removes the new directory when creation fails", async () => {
    await expect(
      createSpace(root, valid as never, {
        finalize: () => {
          throw new Error("boom")
        },
      }),
    ).rejects.toThrow("boom")
    expect(existsSync(spaceDir(root, "work"))).toBe(false)
  })
})

describe("home migration", () => {
  const date = new Date("2026-11-21T10:00:00Z")

  async function legacy() {
    await put(join(root, "data", "opencode", "auth.json"), "{}")
    await put(join(root, "data", "opencode", "opencode.db"), "db")
    await put(
      join(root, "config", "opencode", "opencode.jsonc"),
      JSON.stringify({
        provider: { subscription: { options: { configDir: join(root, LEGACY_CLI_DIR) } } },
        other: [join(root, "config", "x"), join(root, "data"), join(root, "state", "y"), join(root, "cache", "z")],
        keep: join(root, "state", "signing", "k"),
        near: join(root, "dataset"),
      }),
    )
    await put(join(root, "state", "lock"), "l")
    await put(join(root, "state", "signing", "key"), "secret")
    await put(join(root, LEGACY_CLI_DIR, "session"), "s")
    await put(join(root, "cache", "models.json"), "{}")
    await put(join(root, "app", "prefs"), "p")
  }

  test("moves the old tree into the home space and keeps signing in place", async () => {
    await legacy()
    await ensureHomeSpace(root, date)
    const home = spaceDir(root, "home")
    expect(await files(home)).toEqual([
      "cli/session",
      "config/opencode/opencode.jsonc",
      "data/opencode/auth.json",
      "data/opencode/opencode.db",
      "space.json",
      "state/lock",
    ])
    expect(await readFile(join(root, "state", "signing", "key"), "utf8")).toBe("secret")
    expect(await files(join(root, "state"))).toEqual(["signing/key"])
    expect(await readFile(join(root, "state.pre-spaces-2026-11-21", "lock"), "utf8")).toBe("l")
    expect(existsSync(join(root, "state.pre-spaces-2026-11-21", "signing"))).toBe(false)
    expect(await readFile(join(root, "data.pre-spaces-2026-11-21", "opencode", "auth.json"), "utf8")).toBe("{}")
    expect(existsSync(join(root, "config.pre-spaces-2026-11-21", "opencode", "opencode.jsonc"))).toBe(true)
    expect(await readFile(join(root, `${LEGACY_CLI_DIR}.pre-spaces-2026-11-21`, "session"), "utf8")).toBe("s")
    expect(existsSync(join(root, "data"))).toBe(false)
    expect(existsSync(join(root, "config"))).toBe(false)
    expect(existsSync(join(root, LEGACY_CLI_DIR))).toBe(false)
    expect(await readFile(join(root, "cache", "models.json"), "utf8")).toBe("{}")
    expect(await readFile(join(root, "app", "prefs"), "utf8")).toBe("p")
  })

  test("rewrites absolute paths in the copied config only", async () => {
    await legacy()
    await ensureHomeSpace(root, date)
    const home = spaceDir(root, "home")
    const config = JSON.parse(await readFile(join(home, "config", "opencode", "opencode.jsonc"), "utf8"))
    expect(config.provider.subscription.options.configDir).toBe(join(home, "cli"))
    expect(config.other).toEqual([
      join(home, "config", "x"),
      join(home, "data"),
      join(home, "state", "y"),
      join(root, "cache", "z"),
    ])
    expect(config.keep).toBe(join(root, "state", "signing", "k"))
    expect(config.near).toBe(join(root, "dataset"))
    const old = await readFile(join(root, "config.pre-spaces-2026-11-21", "opencode", "opencode.jsonc"), "utf8")
    expect(old).toContain(join(root, LEGACY_CLI_DIR))
  })

  test("rewrites the home placeholders of the installed config to the space variables", async () => {
    const savedHome = process.env.HOME
    const fakeHome = await mkdtemp(join(tmpdir(), "void-fake-home-"))
    try {
      process.env.HOME = fakeHome
      const base = join(fakeHome, "void")
      await put(
        join(base, "config", "opencode", "opencode.jsonc"),
        [
          "{",
          '  "provider": { "subscription": {',
          '    "npm": "file://{env:HOME}/void/config/opencode/provider/subscription.mjs",',
          '    "options": { "defaultSettings": { "env": { "CLAUDE_CONFIG_DIR": "{env:HOME}/void/claude" } } }',
          "  } },",
          '  "other": ["{env:HOME}/void/data/x", "{env:HOME}/void/state/y", "{env:HOME}/void/state/signing/k", "{env:HOME}/void/cache/z", "{env:HOME}/void/dataset"]',
          "}",
        ].join("\n"),
      )
      await put(join(base, LEGACY_CLI_DIR, "session"), "s")
      await ensureHomeSpace(base, date)
      const text = await readFile(join(spaceDir(base, "home"), "config", "opencode", "opencode.jsonc"), "utf8")
      const config = JSON.parse(text)
      expect(config.provider.subscription.npm).toBe(
        "file://{env:XDG_CONFIG_HOME}/opencode/provider/subscription.mjs",
      )
      expect(config.provider.subscription.options.defaultSettings.env.CLAUDE_CONFIG_DIR).toBe("{env:VOID_SPACE_CLI_DIR}")
      expect(config.other).toEqual([
        "{env:XDG_DATA_HOME}/x",
        "{env:XDG_STATE_HOME}/y",
        "{env:HOME}/void/state/signing/k",
        "{env:HOME}/void/cache/z",
        "{env:HOME}/void/dataset",
      ])
    } finally {
      process.env.HOME = savedHome
      await rm(fakeHome, { recursive: true, force: true })
    }
  })

  test("writes the home space.json", async () => {
    await legacy()
    await ensureHomeSpace(root, date)
    const [home] = await listSpaces(root)
    expect(home).toMatchObject({ id: "home", name: "Home", class: "personal", sessionMode: "isolated" })
    expect(typeof home.color).toBe("string")
  })

  test("creates an empty home space when there is no old tree", async () => {
    await ensureHomeSpace(root, date)
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["home"])
    expect(existsSync(join(spaceDir(root, "home"), "data"))).toBe(true)
    expect(existsSync(join(root, "data.pre-spaces-2026-11-21"))).toBe(false)
  })

  test("is idempotent", async () => {
    await legacy()
    await ensureHomeSpace(root, date)
    const first = await files(root)
    await ensureHomeSpace(root, new Date("2026-11-22T10:00:00Z"))
    expect(await files(root)).toEqual(first)
  })

  test("leaves existing home data alone when a new old tree appears after migration", async () => {
    await ensureHomeSpace(root, date)
    await put(join(spaceDir(root, "home"), "data", "keep"), "k")
    await put(join(root, "data", "late"), "x")
    await ensureHomeSpace(root, date)
    expect(await readFile(join(spaceDir(root, "home"), "data", "keep"), "utf8")).toBe("k")
    expect(existsSync(join(root, "data", "late"))).toBe(true)
  })

  test("recovers from a run that stopped before space.json was written", async () => {
    await legacy()
    await mkdir(spaceDir(root, "home"), { recursive: true })
    await put(join(spaceDir(root, "home"), "data", "stale"), "x")
    await ensureHomeSpace(root, date)
    expect(await files(join(spaceDir(root, "home"), "data"))).toEqual(["opencode/auth.json", "opencode/opencode.db"])
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["home"])
  })

  test("avoids clobbering an existing backup name", async () => {
    await legacy()
    await put(join(root, "data.pre-spaces-2026-11-21", "old"), "o")
    await ensureHomeSpace(root, date)
    expect(await readFile(join(root, "data.pre-spaces-2026-11-21", "old"), "utf8")).toBe("o")
    expect(existsSync(join(root, "data.pre-spaces-2026-11-21-2", "opencode", "auth.json"))).toBe(true)
  })
})

describe("home migration safety", () => {
  const date = new Date("2026-11-21T10:00:00Z")

  test("keeps relative symlinks relative", async () => {
    await put(join(root, "config", "opencode", "node_modules", "pkg", "bin.js"), "b")
    await mkdir(join(root, "config", "opencode", "node_modules", ".bin"), { recursive: true })
    await symlink("../pkg/bin.js", join(root, "config", "opencode", "node_modules", ".bin", "tool"))
    await ensureHomeSpace(root, date)
    const link = join(spaceDir(root, "home"), "config", "opencode", "node_modules", ".bin", "tool")
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(await readlink(link)).toBe("../pkg/bin.js")
    expect(await readFile(link, "utf8")).toBe("b")
  })

  test("refuses a source root that is a symlink and changes nothing", async () => {
    const outside = await mkdtemp(join(tmpdir(), "void-outside-"))
    try {
      await put(join(outside, "x"), "x")
      await symlink(outside, join(root, "data"))
      await expect(ensureHomeSpace(root, date)).rejects.toThrow("symlink")
      expect(existsSync(join(spaceDir(root, "home"), "space.json"))).toBe(false)
      expect((await lstat(join(root, "data"))).isSymbolicLink()).toBe(true)
      expect(await readFile(join(outside, "x"), "utf8")).toBe("x")
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  test("makes the migrated tree private and keeps exec bits", async () => {
    await put(join(root, "data", "opencode", "a.db"), "a")
    await put(join(root, "config", "opencode", "tool.sh"), "t")
    await chmod(join(root, "data", "opencode", "a.db"), 0o644)
    await chmod(join(root, "config", "opencode", "tool.sh"), 0o755)
    await chmod(join(root, "data", "opencode"), 0o755)
    await ensureHomeSpace(root, date)
    const home = spaceDir(root, "home")
    expect((await stat(join(home, "data", "opencode", "a.db"))).mode & 0o777).toBe(0o600)
    expect((await stat(join(home, "config", "opencode", "tool.sh"))).mode & 0o777).toBe(0o700)
    expect((await stat(join(home, "data", "opencode"))).mode & 0o777).toBe(0o700)
    expect((await stat(join(home, "data"))).mode & 0o777).toBe(0o700)
  })

  test("resumes after a crash in the middle of the state backup without losing entries", async () => {
    for (const name of ["a", "b", "c", "d"]) await put(join(root, "state", name), name)
    await put(join(root, "state", "signing", "key"), "secret")
    await put(join(root, "data", "opencode", "auth.json"), "{}")
    let moves = 0
    await expect(
      ensureHomeSpace(root, date, {
        beforeMove: () => {
          if (++moves === 3) throw new Error("crash")
        },
      }),
    ).rejects.toThrow("crash")
    expect(existsSync(join(spaceDir(root, "home"), "space.json"))).toBe(false)
    await ensureHomeSpace(root, new Date("2026-11-25T10:00:00Z"))
    const home = spaceDir(root, "home")
    expect(await files(join(home, "state"))).toEqual(["a", "b", "c", "d"])
    expect(await files(join(root, "state"))).toEqual(["signing/key"])
    expect(await readFile(join(home, "data", "opencode", "auth.json"), "utf8")).toBe("{}")
    expect(existsSync(join(home, ".migrating"))).toBe(false)
    expect((await listSpaces(root)).map((space) => space.id)).toEqual(["home"])
    expect(existsSync(join(root, "state.pre-spaces-2026-11-25"))).toBe(false)
  })

  test("logs the start and end of a migration", async () => {
    await put(join(root, "data", "x"), "x")
    const messages: string[] = []
    await ensureHomeSpace(root, date, { log: (message) => messages.push(message) })
    expect(messages).toHaveLength(2)
  })
})
