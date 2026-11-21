import { describe, expect, test } from "bun:test"
import { pluginPackageVersion } from "@/config/plugin-version"

describe("pluginPackageVersion", () => {
  test("returns a plain release version", () => {
    expect(pluginPackageVersion("1.19.6", false)).toBe("1.19.6")
  })

  test("omits a dev preview version", () => {
    expect(pluginPackageVersion("0.0.0-dev-202611210257", false)).toBeUndefined()
  })

  test("omits a branch preview version", () => {
    expect(pluginPackageVersion("0.0.0-void/graph-memory-202611210000", false)).toBeUndefined()
  })

  test("omits the version for local builds", () => {
    expect(pluginPackageVersion("1.19.6", true)).toBeUndefined()
    expect(pluginPackageVersion("local", true)).toBeUndefined()
  })
})
