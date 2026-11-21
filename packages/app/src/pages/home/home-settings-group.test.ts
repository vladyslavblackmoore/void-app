import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dict } from "@/i18n/en"
import { homeSettingsGroupItems, homeSettingsGroupOpen } from "./home-settings-group"

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

describe("home settings group", () => {
  test("lists agents, models and settings with their routes", () => {
    expect(homeSettingsGroupItems.map((item) => item.page)).toEqual(["agents", "models", "settings"])
    expect(homeSettingsGroupItems.map((item) => item.href)).toEqual([
      "/settings/agents",
      "/settings/models",
      "/settings/settings",
    ])
  })

  test("labels resolve to english strings", () => {
    for (const item of homeSettingsGroupItems) expect(typeof dict[item.label]).toBe("string")
  })

  test("is open on a settings page and otherwise follows the toggle", () => {
    expect(homeSettingsGroupOpen(false, undefined)).toBe(false)
    expect(homeSettingsGroupOpen(true, undefined)).toBe(true)
    expect(homeSettingsGroupOpen(false, "models")).toBe(true)
  })
})

describe("titlebar", () => {
  test("does not render the settings tabs", () => {
    const strip = source("../../components/titlebar-tab-strip.tsx")
    expect(strip).not.toContain("settingsTabs")
    expect(strip).not.toContain("SettingsTabItem")
    expect(source("../../components/titlebar-tab-nav.tsx")).not.toContain("SettingsTabItem")
  })
})
