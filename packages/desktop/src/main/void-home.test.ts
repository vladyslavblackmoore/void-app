import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import { VOID_HOME, userXdg, voidAppEnv, voidUserData } from "./void-home"

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

  test("keeps the values recorded before a relaunch", () => {
    const recorded = JSON.stringify({
      XDG_DATA_HOME: "/u/data",
      XDG_CONFIG_HOME: null,
      XDG_CACHE_HOME: "/u/cache",
      XDG_STATE_HOME: null,
    })
    expect(userXdg(VOID_HOME, recorded, { XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: "/other" })).toEqual({
      XDG_DATA_HOME: "/u/data",
      XDG_CONFIG_HOME: undefined,
      XDG_CACHE_HOME: "/u/cache",
      XDG_STATE_HOME: undefined,
    })
  })

  test("never records a dir inside the void root as the user's own", () => {
    expect(
      userXdg(
        VOID_HOME,
        undefined,
        { XDG_DATA_HOME: join(root, "data"), XDG_CONFIG_HOME: root, XDG_CACHE_HOME: "/u/cache" },
        { XDG_DATA_HOME: "/u/data", XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state") },
      ),
    ).toEqual({
      XDG_DATA_HOME: "/u/data",
      XDG_CONFIG_HOME: undefined,
      XDG_CACHE_HOME: "/u/cache",
      XDG_STATE_HOME: undefined,
    })
  })

  test("drops void dirs from a recorded value too", () => {
    const recorded = JSON.stringify({ XDG_DATA_HOME: join(root, "data") })
    expect(userXdg(VOID_HOME, recorded).XDG_DATA_HOME).toBeUndefined()
  })

  test("reads the sources when the recorded value is not valid json", () => {
    expect(userXdg(VOID_HOME, "{", { XDG_DATA_HOME: "/u/data" }).XDG_DATA_HOME).toBe("/u/data")
  })

  test("does not treat a sibling of the void root as inside it", () => {
    expect(userXdg(VOID_HOME, undefined, { XDG_DATA_HOME: root + "-x" }).XDG_DATA_HOME).toBe(root + "-x")
  })

  test("keeps the server off foreign profile dirs for skills and instructions", () => {
    expect(voidAppEnv(VOID_HOME, {}).OPENCODE_DISABLE_CLAUDE_CODE).toBe("true")
  })

  test("keeps the server off shared external skill dirs", () => {
    expect(voidAppEnv(VOID_HOME, {}).OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe("true")
  })

  test("uses another root when given one", () => {
    expect(voidAppEnv("/tmp/x", {}).XDG_STATE_HOME).toBe(join("/tmp/x", "state"))
  })

  test("keeps the packaged app's user data at ~/void/app apart from dev runs", () => {
    expect(voidUserData(true)).toBe(join(root, "app"))
    expect(voidUserData(false)).toBe(join(root, "app-dev"))
  })
})
