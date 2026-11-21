import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { copyKey, voidCopyKeys } from "./void-copy"
import { isColorScheme, resetButtonVariant, schemeSegments, spaceRows } from "./settings-void-model"

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
    ]) {
      expect(value(key)).not.toBe("")
    }
  })
})
