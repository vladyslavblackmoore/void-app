import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const sources = [
  "../../../../app/src/components/dialog-command-palette-v2.tsx",
  "../../../../app/src/components/dialog-command-palette-v2.css",
  "../../v2/components/dialog-v2.css",
  "../../v2/components/text-input-v2.css",
  "../../v2/components/keybind-v2.css",
  "../../context/dialog.tsx",
]

function css() {
  return readFileSync(new URL("palette.css", dir), "utf8")
}

function rules() {
  return [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

function body(selector: string) {
  const rule = rules().find((item) => item.selectors.includes(selector))
  expect(rule).toBeDefined()
  return rule!.body
}

describe("void command palette", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("palette.css", dir))).toBe(true)
    expect(css()).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(10)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith('html[data-theme="void"]')).toBe(true)
  })

  test("targets only classes and attributes that exist upstream", () => {
    const upstream = sources.map((name) => readFileSync(new URL(name, dir), "utf8")).join("\n")
    const names = new Set<string>()
    for (const match of css().matchAll(/\.(command-palette-v2[a-z-]*)/g)) names.add(match[1]!)
    for (const match of css().matchAll(/\[(data-[a-z-]+)(="[a-z0-9-]+")?\]/g)) names.add(match[1]!)
    names.delete("data-theme")
    names.delete("data-color-scheme")
    expect(names.size).toBeGreaterThan(10)
    for (const name of names) expect(upstream).toContain(name)
  })

  test("the panel is an opaque menu surface with an edge, radius 20 and the void shadow", () => {
    const panel = body(
      'html[data-theme="void"] [data-component="dialog-v2"]:has(.command-palette-v2) [data-slot="dialog-container"]',
    )
    expect(panel).toContain("background: var(--void-menu-bg)")
    expect(panel).not.toContain("backdrop-filter")
    expect(panel).toContain("border: 1px solid var(--void-border)")
    expect(panel).toContain("border-radius: var(--void-radius-card)")
    expect(panel).toContain("box-shadow: var(--void-shadow)")
  })

  test("the panel background resolves to an opaque colour in dark and light", () => {
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    const values = [...tokens.matchAll(/--void-menu-bg:\s*([^;]+);/g)].map((match) => match[1]!.trim())
    expect(values.length).toBe(2)
    for (const value of values) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i)
      expect(value).not.toContain("rgba")
      expect(value).not.toContain("transparent")
    }
    for (const selector of ["search", "results"]) {
      const rule = rules().find((item) => item.selectors.includes(`${prefix}.command-palette-v2-${selector}`))
      expect(rule!.body).not.toContain("background")
    }
  })

  test("the palette shares the dialog scrim and defines none of its own", () => {
    const text = css()
    expect(text).not.toContain("scrim")
    expect(text).not.toContain('[data-component="dialog-overlay"]')
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    expect(tokens).toContain("--void-scrim: rgba(5, 6, 8, 0.62)")
    expect(tokens).toContain("--void-scrim: rgba(226, 230, 240, 0.55)")
  })

  test("the search row has an inner fill, radius 14 and a readable placeholder", () => {
    const field = 'html[data-theme="void"] .command-palette-v2-search [data-component="text-input-v2"]'
    expect(css()).toContain(`${field},\n${prefix}.command-palette-v2-search [data-component="text-input-v2"] [data-slot="text-input-v2-value"]`)
    expect(css()).toContain("border-radius: var(--void-radius-inner)")
    expect(css()).toContain("background: var(--void-inner)")
    expect(body(`${field} [data-slot="text-input-v2-input"]::placeholder`)).toContain("color: var(--void-text-2)")
  })

  test("rows have radius 14 and the selected row is the pill", () => {
    expect(body('html[data-theme="void"] .command-palette-v2-row')).toContain("border-radius: var(--void-radius-inner)")
    const active = body('html[data-theme="void"] .command-palette-v2-row[data-active]')
    expect(active).toContain("background: var(--void-pill)")
    expect(active).toContain("color: var(--void-pill-text)")
  })

  test("section labels and shortcut chips use text-2 and inner chips", () => {
    expect(body('html[data-theme="void"] .command-palette-v2-group-title')).toContain("color: var(--void-text-2)")
    const key = body(
      'html[data-theme="void"] .command-palette-v2-row [data-component="keybind-v2"][data-variant="neutral"] [data-slot="keybind-v2-key"]',
    )
    expect(key).toContain("background: var(--void-inner)")
    expect(key).toContain("border-radius: var(--void-radius-chip)")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/palette.css")
  })
})
