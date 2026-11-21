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
