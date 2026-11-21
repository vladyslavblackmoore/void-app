import { describe, expect, test } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { resolveTheme } from "./resolve"
import { resolveThemeV2 } from "./v2/resolve"
import type { DesktopTheme } from "./types"

const root = new URL(".", import.meta.url)
const themePath = new URL("./themes/void.json", root)
const schema = JSON.parse(readFileSync(new URL("./desktop-theme.schema.json", root), "utf8"))

function load(): DesktopTheme {
  expect(existsSync(themePath)).toBe(true)
  return JSON.parse(readFileSync(themePath, "utf8"))
}

function matches(pattern: string, value: unknown) {
  return typeof value === "string" && new RegExp(pattern).test(value)
}

function validateVariant(variant: Record<string, any>) {
  const errors: string[] = []
  const hex = schema.definitions.HexColor.pattern
  const color = schema.definitions.ColorValue.pattern
  const allowed = Object.keys(schema.definitions.ThemeVariant.properties)
  for (const key of Object.keys(variant)) if (!allowed.includes(key)) errors.push(`unknown variant key ${key}`)
  if (!variant.palette && !variant.seeds) errors.push("palette or seeds required")
  for (const [key, value] of Object.entries(variant.palette ?? {})) {
    if (!matches(hex, value)) errors.push(`palette.${key}`)
  }
  for (const [key, value] of Object.entries(variant.overrides ?? {})) {
    if (!matches(color, value)) errors.push(`overrides.${key}`)
  }
  for (const [key, value] of Object.entries(variant.v2Overrides ?? {})) {
    if (typeof value !== "string") errors.push(`v2Overrides.${key}`)
  }
  return errors
}

describe("void theme", () => {
  test("validates against the desktop theme schema", () => {
    const theme = load()
    for (const key of schema.required) expect(theme).toHaveProperty(key)
    expect(matches(schema.properties.id.pattern, theme.id)).toBe(true)
    expect(theme.id).toBe("void")
    expect(validateVariant(theme.dark as any)).toEqual([])
    expect(validateVariant(theme.light as any)).toEqual([])
  })

  test("resolves v1 and v2 tokens for both variants", () => {
    const theme = load()
    const v1 = resolveTheme(theme)
    const v2 = resolveThemeV2(theme)
    expect(v1.dark["background-base"]).toBe("#0c0d0f")
    expect(v1.dark["text-strong"]).toBe("#f2f2f4")
    expect(v1.dark["surface-raised-base"]).toBe("#1c1c1e")
    expect(v2.dark["v2-background-bg-deep"]).toBe("#0c0d0f")
    expect(v2.dark["v2-background-bg-layer-01"]).toBe("#1c1c1e")
    expect(v2.dark["v2-background-bg-layer-02"]).toBe("#26272b")
    expect(v2.dark["v2-text-text-base"]).toBe("#f2f2f4")
    expect(v2.dark["v2-text-text-muted"]).toBe("#a1a2ab")
    expect(v2.dark["v2-state-fg-success"]).toBe("#3EED73")
    expect(v2.dark["v2-state-fg-info"]).toBe("#6DB5FF")
    expect(v2.dark["v2-state-fg-warning"]).toBe("#FEFA3D")
    expect(v2.dark["v2-state-fg-danger"]).toBe("#F87171")
    expect(v2.dark["v2-elevation-floating"]).toBe("0 18px 40px rgba(0,0,0,.45)")
    expect(v2.dark["v2-elevation-overlay"]).toBe("0 18px 40px rgba(0,0,0,.45)")
    expect(v2.light["v2-background-bg-deep"]).toBe("#eceef1")
  })

  test("defines the same border keys in both variants", () => {
    const theme = load()
    const keys = (variant: any) => Object.keys(variant.v2Overrides).filter((key) => key.startsWith("v2-border-")).sort()
    expect(keys(theme.light)).toEqual(keys(theme.dark))
  })

  test("is registered by name and sits in the themes folder", () => {
    const source = readFileSync(new URL("./context.tsx", root), "utf8")
    expect(source).toContain('void: "VOID"')
    expect(existsSync(themePath)).toBe(true)
  })
})
