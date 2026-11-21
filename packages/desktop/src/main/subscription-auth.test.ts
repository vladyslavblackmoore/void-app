import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

type Result = { type: string; key?: string }
type Method = { authorize: () => Promise<{ callback: () => Promise<Result> }> }
type Hooks = {
  auth: { provider: string; connected: (auth: unknown) => Promise<boolean>; methods: Method[] }
  dispose?: () => Promise<void>
}

const source = join(import.meta.dir, "../../resources/plugin/subscription-auth.js")
const script = `#!/bin/sh
dir="$(dirname "$0")"
echo "$*" >> "$dir/calls"
case "$1 $2" in
  "auth status")
    if [ -f "$dir/garbage" ]; then echo "not json"; exit 0; fi
    echo "{\\"loggedIn\\": $(cat "$dir/state")}"
    ;;
  "auth logout")
    echo false > "$dir/state"
    ;;
  "auth login")
    mode="$(cat "$dir/mode")"
    if [ "$mode" = "hang" ]; then sleep 30; exit 0; fi
    if [ "$mode" = "fail" ]; then exit 1; fi
    echo true > "$dir/state"
    ;;
esac
`

let dir = ""
let count = 0
const home = process.env.HOME

async function setup(state: boolean, mode = "ok") {
  await writeFile(join(dir, "state"), `${state}\n`)
  await writeFile(join(dir, "mode"), `${mode}\n`)
}

async function load() {
  count++
  const mod = await import(`${source}?case=${count}`)
  const hooks = (await mod.default.server({}, { binary: join(dir, "cli"), configDir: dir })) as Hooks
  return hooks
}

async function calls() {
  const text = await readFile(join(dir, "calls"), "utf8").catch(() => "")
  return text.split("\n").filter(Boolean)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "subscription-auth-"))
  process.env.HOME = dir
  await writeFile(join(dir, "cli"), script)
  await chmod(join(dir, "cli"), 0o755)
})

afterEach(async () => {
  process.env.HOME = home
  await rm(dir, { recursive: true, force: true })
})

describe("subscription auth plugin", () => {
  test("status parsing decides the connected state", async () => {
    await setup(true)
    expect(await (await load()).auth.connected({ type: "api", key: "subscription" })).toBe(true)
    await setup(false)
    expect(await (await load()).auth.connected({ type: "api", key: "subscription" })).toBe(false)
    await setup(true)
    await writeFile(join(dir, "garbage"), "")
    expect(await (await load()).auth.connected({ type: "api", key: "subscription" })).toBe(false)
  })

  test("a missing marker reads as not connected without logging out", async () => {
    await setup(true)
    const hooks = await load()
    expect(await hooks.auth.connected(undefined)).toBe(false)
    expect(await hooks.auth.connected(undefined)).toBe(false)
    expect((await calls()).filter((line) => line.startsWith("auth logout"))).toEqual([])
    expect((await readFile(join(dir, "state"), "utf8")).trim()).toBe("true")
  })

  test("removing a seen marker is a disconnect and logs the cli out", async () => {
    await setup(true)
    const hooks = await load()
    expect(await hooks.auth.connected({ type: "api", key: "subscription" })).toBe(true)
    expect(await hooks.auth.connected(undefined)).toBe(false)
    expect((await calls()).filter((line) => line.startsWith("auth logout"))).toHaveLength(1)
  })

  test("a finished login counts as connected until the marker is stored", async () => {
    await setup(false)
    const hooks = await load()
    const started = await hooks.auth.methods[0].authorize()
    expect(await started.callback()).toEqual(expect.objectContaining({ type: "success", key: "subscription" }))
    expect(await hooks.auth.connected(undefined)).toBe(true)
    expect((await calls()).filter((line) => line.startsWith("auth logout"))).toEqual([])
  })

  test("a failed login reports failure", async () => {
    await setup(false, "fail")
    const hooks = await load()
    const started = await hooks.auth.methods[0].authorize()
    expect((await started.callback()).type).toBe("failed")
  })

  test("a new login replaces a running one", async () => {
    await setup(false, "hang")
    const hooks = await load()
    const first = await hooks.auth.methods[0].authorize()
    await Bun.sleep(100)
    await setup(false, "ok")
    const second = await hooks.auth.methods[0].authorize()
    expect((await first.callback()).type).toBe("failed")
    expect((await second.callback()).type).toBe("success")
  })

  test("dispose stops a running login", async () => {
    await setup(false, "hang")
    const hooks = await load()
    const started = await hooks.auth.methods[0].authorize()
    await Bun.sleep(100)
    await hooks.dispose?.()
    const result = await Promise.race([started.callback(), Bun.sleep(3000).then(() => ({ type: "timeout" }))])
    expect(result.type).toBe("failed")
  })
})

const dirStub = `#!/bin/sh
d="\${CLAUDE_CONFIG_DIR:-}"
echo "\${CLAUDE_CONFIG_DIR-unset}" >> "$0.envs"
if [ -z "$d" ]; then d="$HOME/default-login"; fi
mkdir -p "$d"
case "$1 $2" in
  "auth status")
    echo "{\\"loggedIn\\": $(cat "$d/state" 2>/dev/null || echo false)}"
    ;;
  "auth login")
    echo true > "$d/state"
    ;;
esac
`

async function loadWith(options: Record<string, unknown>) {
  count++
  const mod = await import(`${source}?case=${count}`)
  return (await mod.default.server({}, { binary: join(dir, "stub"), ...options })) as Hooks
}

describe("subscription auth plugin per space", () => {
  const saved = process.env.VOID_SPACE_CLI_DIR

  beforeEach(async () => {
    delete process.env.VOID_SPACE_CLI_DIR
    await writeFile(join(dir, "stub"), dirStub)
    await chmod(join(dir, "stub"), 0o755)
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.VOID_SPACE_CLI_DIR
    else process.env.VOID_SPACE_CLI_DIR = saved
  })

  test("signing in one space leaves another signed out", async () => {
    const first = await loadWith({ configDir: join(dir, "space-a") })
    const second = await loadWith({ configDir: join(dir, "space-b") })
    const started = await first.auth.methods[0].authorize()
    expect((await started.callback()).type).toBe("success")
    expect(await first.auth.connected({ type: "api", key: "subscription" })).toBe(true)
    expect(await second.auth.connected({ type: "api", key: "subscription" })).toBe(false)
  })

  test("takes the login directory from the space variable when no option is set", async () => {
    process.env.VOID_SPACE_CLI_DIR = join(dir, "from-env")
    const hooks = await loadWith({})
    const started = await hooks.auth.methods[0].authorize()
    expect(await started.callback()).toEqual(
      expect.objectContaining({ type: "success", metadata: { configDir: join(dir, "from-env") } }),
    )
    expect((await readFile(join(dir, "from-env", "state"), "utf8")).trim()).toBe("true")
    expect(await readFile(join(dir, "stub.envs"), "utf8")).toContain(join(dir, "from-env"))
  })

  test("a removed marker never logs the user's own cli out when no directory is set", async () => {
    await writeFile(join(dir, "stub"), dirStub.replace('"auth login")', '"auth logout")\n    echo logout >> "$0.logouts"\n    ;;\n  "auth login")'))
    const hooks = await loadWith({})
    await (await hooks.auth.methods[0].authorize()).callback()
    expect(await hooks.auth.connected({ type: "api", key: "subscription" })).toBe(true)
    expect(await hooks.auth.connected(undefined)).toBe(false)
    expect(await readFile(join(dir, "stub.logouts"), "utf8").catch(() => "")).toBe("")
  })

  test("an option wins over the space variable", async () => {
    process.env.VOID_SPACE_CLI_DIR = join(dir, "from-env")
    const hooks = await loadWith({ configDir: join(dir, "from-option") })
    await (await hooks.auth.methods[0].authorize()).callback()
    expect((await readFile(join(dir, "from-option", "state"), "utf8")).trim()).toBe("true")
  })

  test("without a directory the cli gets no config dir variable and uses its default", async () => {
    const hooks = await loadWith({})
    const started = await hooks.auth.methods[0].authorize()
    expect(await started.callback()).toEqual(
      expect.objectContaining({ type: "success", metadata: { userDefault: true } }),
    )
    await hooks.auth.connected({ type: "api", key: "subscription" })
    const envs = (await readFile(join(dir, "stub.envs"), "utf8")).split("\n").filter(Boolean)
    expect(envs.length).toBeGreaterThan(0)
    expect(envs.every((line) => line === "unset")).toBe(true)
    expect((await readFile(join(dir, "default-login", "state"), "utf8")).trim()).toBe("true")
  })
})
