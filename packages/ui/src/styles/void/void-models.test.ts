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
    expect(rule).toContain("padding: 0 var(--void-shadow-bleed) var(--void-shadow-tail)")
    expect(rule).toContain("margin: 0 calc(var(--void-shadow-bleed) * -1)")
    expect(rule).not.toMatch(/margin:\s*-/)
    expect(rule).not.toContain("24px")
    expect(rule).not.toContain("height:")
  })

  test("the connect dialog is a lifted card with a shadow and no fixed empty height", () => {
    const rule = body(".void-connect-dialog")
    expect(rule).toContain("background: var(--void-sheet)")
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    expect(tokens.match(/--void-sheet: /g)?.length).toBe(2)
    expect(tokens).toContain("--void-sheet: var(--void-card)")
    expect(rule).toContain("border: 1px solid var(--void-border-strong)")
    expect(rule).toContain("box-shadow: var(--void-shadow)")
    expect(rule).toContain("height: auto !important")
  })

  test("the connect dialog container has no fixed utility height that beats the stylesheet", () => {
    const source = readFileSync(
      new URL("../../../../app/src/components/dialog-connect-provider.tsx", import.meta.url),
      "utf8",
    )
    expect(source).toContain("void-connect-dialog")
    expect(source).not.toMatch(/containerClass="[^"]*!h-\[/)
  })

  test("a scrim dims the page behind dialogs and is a token in both schemes", () => {
    expect(body('[data-component="dialog-overlay"]')).toContain("background-color: var(--void-scrim)")
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    expect(tokens.match(/--void-scrim: /g)?.length).toBe(2)
  })

  test("the models list fills the canvas and uses a void search field", () => {
    expect(body(".settings-v2-tab-body.settings-v2-models")).toContain("grid-template-columns: minmax(0, 1fr)")
    expect(body(".settings-v2-tab-body.settings-v2-models")).not.toContain("640px")
    expect(body('[data-component="text-input-v2"]')).toContain("var(--void-control-h")
  })

  test("toggles use the void track and green accent", () => {
    expect(body('[data-component="switch"][data-checked] [data-slot="switch-control"]')).toContain(
      "background: var(--void-green)",
    )
    expect(body('[data-slot="switch-thumb"]')).toContain("width: 14px")
  })

  test("the default model panel starts level with the grid and lists options as radios", () => {
    expect(body(".void-default-model-option")).toContain("border-radius: var(--void-radius-control")
    expect(body('.void-default-model-option[aria-checked="true"]')).toContain("background: var(--void-pill)")
    expect(body(".void-default-model-options")).toContain("overflow-y: auto")
    expect(body(".void-default-model-actions > *")).toContain("flex: 1")
  })

  test("provider card tags stay on one line", () => {
    expect(body(".void-providers-layout .void-provider-card-tags")).toContain("flex-wrap: nowrap")
    expect(body(".void-providers-layout .void-provider-tag")).toContain("text-overflow: ellipsis")
  })

  test("uses only void tokens for colours", () => {
    const css = readFileSync(new URL("models.css", dir), "utf8")
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })

  test("the effort note sits under the disabled control in the secondary text colour", () => {
    const rule = body(".void-default-model-note")
    expect(rule).toContain("color: var(--void-text-2)")
    expect(rule).toContain("font-size: var(--void-fs-small")
  })

  test("the default model Reset and Save are 44px pills like the agents editor", () => {
    const rule = body(".void-default-model-actions > [data-component=\"button-v2\"]")
    expect(rule).toContain("min-height: var(--void-control-h, 44px)")
    expect(rule).toContain("border-radius: var(--void-radius-control")
    expect(rule).toContain("font-size: var(--void-fs-body")
  })

  test("a disabled Save is faded well below the active pill", () => {
    const rule = body(".void-default-model-actions [data-variant=\"contrast\"]:disabled")
    const opacity = Number(/opacity: ([\d.]+)/.exec(rule)?.[1])
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThanOrEqual(0.45)
  })

  test("the default model panel is sticky, sized to the visible area, with its actions pinned at the bottom", () => {
    const panel = body(".void-default-model")
    expect(panel).toContain("position: sticky")
    expect(panel).toContain("top: 0")
    expect(panel).toContain("height: calc(100vh - 176px - var(--void-gutter))")
    expect(panel).toContain("align-self: start")
    expect(body(".void-providers-layout")).not.toContain("align-items: stretch")
    expect(body(".void-default-model-options")).toContain("flex: 0 1 auto")
    expect(body(".void-default-model-options")).toContain("min-height: 96px")
    expect(body(".void-default-model-options")).not.toContain("max-height")
    expect(body(".void-default-model-actions")).toContain("margin-top: auto")
  })
})
