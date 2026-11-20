import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import { VOID_HOME, voidAppEnv, voidUserData } from "./void-home"

const root = join(homedir(), "void")

describe("void home", () => {
  test("roots all void state at ~/void", () => {
    expect(VOID_HOME).toBe(root)
  })

  test("points every xdg dir under the void root", () => {
    const env = voidAppEnv(VOID_HOME, {})
    expect(env.XDG_DATA_HOME).toBe(join(root, "data"))
    expect(env.XDG_CONFIG_HOME).toBe(join(root, "config"))
    expect(env.XDG_CACHE_HOME).toBe(join(root, "cache"))
    expect(env.XDG_STATE_HOME).toBe(join(root, "state"))
  })

  test("ignores the user's own xdg dirs for void but records them for agent shells", () => {
    const env = voidAppEnv(VOID_HOME, {
      XDG_DATA_HOME: "/u/data",
      XDG_CONFIG_HOME: "/u/config",
      XDG_CACHE_HOME: "",
      XDG_STATE_HOME: undefined,
    })
    expect(env.XDG_DATA_HOME).toBe(join(root, "data"))
    expect(env.XDG_CONFIG_HOME).toBe(join(root, "config"))
    expect(JSON.parse(env.VOID_USER_ENV)).toEqual({
      XDG_DATA_HOME: "/u/data",
      XDG_CONFIG_HOME: "/u/config",
      XDG_CACHE_HOME: null,
      XDG_STATE_HOME: null,
    })
  })

  test("uses another root when given one", () => {
    expect(voidAppEnv("/tmp/x", {}).XDG_STATE_HOME).toBe(join("/tmp/x", "state"))
  })

  test("keeps the packaged app's user data at ~/void/app apart from dev runs", () => {
    expect(voidUserData(true)).toBe(join(root, "app"))
    expect(voidUserData(false)).toBe(join(root, "app-dev"))
  })
})
