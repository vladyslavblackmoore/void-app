import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { copyKey, voidCopyKeys } from "./void-copy"
import {
  isColorScheme,
  notificationsEnabled,
  resetButtonVariant,
  schemeSegments,
  sessionsKey,
  spaceRows,
  voidGeneralLayout,
} from "./settings-void-model"

const spaces = [
  { id: "home", name: "Home", color: "#2f7fd6", class: "personal" as const, running: false, busy: false },
  { id: "work", name: "Work", color: "not-a-colour", class: "company" as const, running: true, busy: true },
  { id: "lab", name: "Lab", color: "#6b52e0", class: "personal" as const, running: false, busy: false },
]

describe("appearance segments", () => {
  test("lists dark, light and system in that order", () => {
    expect(schemeSegments.map((segment) => segment.value)).toEqual(["dark", "light", "system"])
  })

  test("labels reuse the existing colour scheme strings", () => {
    expect(schemeSegments.map((segment) => segment.label)).toEqual([
      "theme.scheme.dark",
      "theme.scheme.light",
      "theme.scheme.system",
    ])
  })

  test("accepts only known colour schemes", () => {
    expect(isColorScheme("light")).toBe(true)
    expect(isColorScheme("system")).toBe(true)
    expect(isColorScheme("sepia")).toBe(false)
    expect(isColorScheme(null)).toBe(false)
  })
})

describe("space rows", () => {
  test("map every space with its core state", () => {
    const rows = spaceRows(spaces, new Set())
    expect(rows.map((row) => [row.id, row.core])).toEqual([
      ["home", "stopped"],
      ["work", "running"],
      ["lab", "stopped"],
    ])
  })

  test("a space being started shows the starting state and cannot be started again", () => {
    const rows = spaceRows(spaces, new Set(["lab"]))
    expect(rows[2]!.core).toBe("starting")
    expect(rows[2]!.canStart).toBe(false)
  })

  test("only stopped spaces can be started", () => {
    const rows = spaceRows(spaces, new Set())
    expect(rows.map((row) => row.canStart)).toEqual([true, false, true])
  })

  test("falls back to the void space colour for an invalid colour", () => {
    const rows = spaceRows(spaces, new Set())
    expect(rows[0]!.color).toBe("#2f7fd6")
    expect(rows[1]!.color).toBe("var(--void-space-void)")
  })

  test("keeps the space class for the meta line", () => {
    expect(spaceRows(spaces, new Set()).map((row) => row.class)).toEqual(["personal", "company", "personal"])
  })
})

describe("space row action", () => {
  test("a running space offers stop, a stopped one start, a starting one the starting label", () => {
    const rows = spaceRows(spaces, new Set(["lab"]))
    expect(rows.map((row) => row.action)).toEqual(["start", "stop", "starting"])
  })

  test("only the start action can be pressed", () => {
    const rows = spaceRows(spaces, new Set(["lab"]))
    expect(rows.map((row) => row.canStart)).toEqual([true, false, false])
  })
})

describe("space row default tag and sessions", () => {
  test("tags only the default space", () => {
    const rows = spaceRows(spaces, new Set(), { defaultId: "work" })
    expect(rows.map((row) => row.isDefault)).toEqual([false, true, false])
  })

  test("no default id tags nothing", () => {
    expect(spaceRows(spaces, new Set()).some((row) => row.isDefault)).toBe(false)
  })

  test("carries the known session count and leaves the others unknown", () => {
    const rows = spaceRows(spaces, new Set(), { sessions: { work: 2 } })
    expect(rows.map((row) => row.sessions)).toEqual([undefined, 2, undefined])
  })

  test("picks the singular or plural session string and none when unknown", () => {
    expect(sessionsKey(undefined)).toBeUndefined()
    expect(sessionsKey(1)).toBe("void.settings.spaces.sessionOne")
    expect(sessionsKey(0)).toBe("void.settings.spaces.sessionMany")
    expect(sessionsKey(3)).toBe("void.settings.spaces.sessionMany")
  })
})

describe("void general layout", () => {
  test("renders the mockup cards in two columns", () => {
    expect(voidGeneralLayout({ spaces: true, dataFolder: true })).toEqual({
      left: ["general", "appearance"],
      right: ["spaces", "defaultSpace", "data"],
    })
  })

  test("leaves out the cards whose back end is missing and never renders the upstream advanced list", () => {
    const layout = voidGeneralLayout({ spaces: false, dataFolder: false })
    expect(layout).toEqual({ left: ["general", "appearance"], right: [] })
    expect([...layout.left, ...layout.right]).not.toContain("advanced")
  })
})

describe("notifications row", () => {
  test("is on when any channel is on", () => {
    expect(notificationsEnabled({ agent: false, permissions: true, errors: false })).toBe(true)
    expect(notificationsEnabled({ agent: false, permissions: false, errors: false })).toBe(false)
  })
})

describe("shortcuts reset button", () => {
  test("is a secondary button under the void theme and ghost elsewhere", () => {
    expect(resetButtonVariant(true)).toBe("neutral")
    expect(resetButtonVariant(false)).toBe("ghost")
  })
})

describe("void settings branding", () => {
  const en = readFileSync(new URL("../../i18n/en.ts", import.meta.url), "utf8")
  const general = readFileSync(new URL("./general.tsx", import.meta.url), "utf8")
  const value = (key: string) => new RegExp(`^  "${key.replaceAll(".", "\\.")}": (.*),$`, "m").exec(en)?.[1] ?? ""

  test("no override text names the upstream product", () => {
    for (const key of voidCopyKeys) {
      expect(value(`void.copy.${key}`)).not.toBe("")
      expect(value(`void.copy.${key}`).toLowerCase()).not.toContain("opencode")
    }
  })

  test("every general row whose upstream text names the product has a void override", () => {
    const branded = [...en.matchAll(/^  "(settings\.general\.row\.[a-zA-Z.]+)": (.*),$/gm)]
      .filter((match) => match[2]!.toLowerCase().includes("opencode") && general.includes(`"${match[1]}"`))
      .map((match) => match[1]!)
    expect(branded.length).toBeGreaterThan(0)
    for (const key of branded) expect(copyKey(true, key)).not.toBe(key)
  })

  test("the void general page does not render the upstream advanced list", () => {
    const source = readFileSync(new URL("./general-void.tsx", import.meta.url), "utf8")
    expect(source).not.toContain("settings.general.section.advanced")
    for (const name of ["ShellSetting", "SoundSetting", "FontSetting", "PermissionScopeSetting"])
      expect(source).not.toContain(name)
  })

  test("the void settings strings name no upstream product", () => {
    for (const [key, text] of en.matchAll(/^  "(void\.settings\.[a-zA-Z.]+)": (.*),$/gm).map((m) => [m[1]!, m[2]!]))
      expect([key, text.toLowerCase().includes("opencode")]).toEqual([key, false])
  })

  test("the void spaces card strings exist in english", () => {
    for (const key of [
      "void.settings.spaces.title",
      "void.settings.spaces.hint",
      "void.settings.spaces.class.personal",
      "void.settings.spaces.class.company",
      "void.settings.spaces.core.running",
      "void.settings.spaces.core.starting",
      "void.settings.spaces.core.stopped",
      "void.settings.spaces.start",
      "void.settings.spaces.stop",
      "void.settings.spaces.starting",
      "void.settings.spaces.default",
      "void.settings.spaces.sessionOne",
      "void.settings.spaces.sessionMany",
      "void.settings.notifications.title",
      "void.settings.notifications.description",
      "void.settings.appearance.glows.title",
      "void.settings.appearance.glows.description",
      "void.settings.appearance.grid.title",
      "void.settings.appearance.grid.description",
      "void.settings.appearance.motion.title",
      "void.settings.appearance.motion.description",
      "void.settings.appearance.density.title",
      "void.settings.appearance.density.description",
      "void.settings.appearance.density.comfortable",
      "void.settings.appearance.density.compact",
      "void.settings.defaultSpace.title",
      "void.settings.defaultSpace.open.title",
      "void.settings.defaultSpace.open.description",
      "void.settings.data.title",
      "void.settings.data.folder.title",
      "void.settings.data.reveal",
    ]) {
      expect(value(key)).not.toBe("")
    }
  })
})
