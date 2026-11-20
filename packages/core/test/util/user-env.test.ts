import { describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { userEnv } from "@opencode-ai/core/util/user-env"

const app = {
  PATH: "/usr/bin:/bin",
  XDG_CONFIG_HOME: "/home/u/.config/void",
  XDG_DATA_HOME: "/home/u/.local/share/void",
  VOID_USER_ENV: JSON.stringify({ XDG_CONFIG_HOME: "/home/u/.config", XDG_DATA_HOME: null }),
}

describe("util.user-env", () => {
  test("restores the recorded user values", () => {
    const env = userEnv(app, app)
    expect(env.XDG_CONFIG_HOME).toBe("/home/u/.config")
    expect(env.PATH).toBe("/usr/bin:/bin")
  })

  test("unsets values the user did not have and drops the record", () => {
    const env = { ...app, ...userEnv(app, app) }
    expect(env.XDG_DATA_HOME).toBeUndefined()
    expect(env.VOID_USER_ENV).toBeUndefined()
  })

  test("keeps values a caller set explicitly", () => {
    const env = userEnv({ ...app, XDG_CONFIG_HOME: "/custom" }, app)
    expect(env.XDG_CONFIG_HOME).toBe("/custom")
    expect(env.XDG_DATA_HOME).toBeUndefined()
  })

  test("returns an unchanged copy without a record", () => {
    const base = { PATH: "/bin", XDG_CONFIG_HOME: "/x" }
    const env = userEnv(base, base)
    expect(env).toEqual(base)
    expect(env).not.toBe(base)
  })

  test("ignores a malformed record", () => {
    const base = { XDG_CONFIG_HOME: "/x", VOID_USER_ENV: "{" }
    const env = { ...base, ...userEnv(base, base) }
    expect(env.XDG_CONFIG_HOME).toBe("/x")
    expect(env.VOID_USER_ENV).toBeUndefined()
  })

  test.skipIf(process.platform === "win32")("a spawned process sees the user values", () => {
    const out = spawnSync("/usr/bin/env", [], { env: { ...app, ...userEnv(app, app) } }).stdout.toString()
    expect(out.split("\n").filter((line) => line.startsWith("XDG_") || line.startsWith("VOID_"))).toEqual([
      "XDG_CONFIG_HOME=/home/u/.config",
    ])
  })
})
