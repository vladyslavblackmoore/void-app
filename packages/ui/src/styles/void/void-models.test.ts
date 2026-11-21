import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '

function rules() {
  const css = readFileSync(new URL("models.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

const body = (needle: string) => rules().find((rule) => rule.selectors.some((s) => s.endsWith(needle)))?.body ?? ""

describe("void models screens", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("models.css", dir))).toBe(true)
    expect(readFileSync(new URL("models.css", dir), "utf8")).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(10)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("is wired into the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/models.css")
  })

  test("the provider grid has three columns next to a fixed-width default model panel", () => {
    expect(body(".void-providers-layout .void-provider-grid")).toContain("repeat(3, minmax(0, 1fr))")
    expect(body(".void-providers-layout")).toContain("var(--void-panel-w-lg")
  })

  test("the scroller keeps bottom and side padding so shadows and the last row are not clipped", () => {
    const rule = body('[data-nav="segmented"] .void-settings-content')
    expect(rule).toContain("padding: 8px 24px 64px")
    expect(rule).toContain("margin: -8px -24px 0")
  })

  test("the connect dialog is a lifted card with a shadow and no fixed empty height", () => {
    const rule = body(".void-connect-dialog")
    expect(rule).toContain("background: var(--void-card)")
    expect(rule).toContain("box-shadow: var(--void-shadow)")
    expect(rule).toContain("height: auto !important")
  })

  test("the models list fills the canvas and uses a void search field", () => {
    expect(body(".settings-v2-tab-body.settings-v2-models")).toContain("repeat(auto-fit, minmax(380px, 1fr))")
    expect(body('[data-component="text-input-v2"]')).toContain("var(--void-control-h")
  })

  test("toggles use the void track and green accent", () => {
    expect(body('[data-component="switch"][data-checked] [data-slot="switch-control"]')).toContain(
      "background: var(--void-green)",
    )
    expect(body('[data-slot="switch-thumb"]')).toContain("width: 14px")
  })

  test("uses only void tokens for colours", () => {
    const css = readFileSync(new URL("models.css", dir), "utf8")
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })
})
