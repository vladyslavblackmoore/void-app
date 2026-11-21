import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const picker = readFileSync(new URL("../../../../app/src/components/dialog-select-model-unpaid-v2.tsx", dir), "utf8")
const pickerV1 = readFileSync(new URL("../../../../app/src/components/dialog-select-model-unpaid.tsx", dir), "utf8")
const tooltip = readFileSync(new URL("../../../../app/src/components/model-tooltip.tsx", dir), "utf8")

function css() {
  return readFileSync(new URL("model-picker.css", dir), "utf8")
}

function rules() {
  return [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

function body(needle: string) {
  return rules().find((rule) => rule.selectors.some((s) => s.includes(needle)))?.body ?? ""
}

describe("void model picker", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("model-picker.css", dir))).toBe(true)
    expect(css()).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(8)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", dir), "utf8")
    expect(index).toContain("@opencode-ai/ui/styles/void/model-picker.css")
  })

  test("the picker and its tooltip carry the data attributes the styles target", () => {
    for (const attribute of [
      "data-void-model-picker",
      'data-slot="free-models-title"',
      'data-slot="view-more-providers"',
      'data-slot="add-more-models"',
      'data-slot="model-option"',
      "data-selected",
    ])
      expect(picker).toContain(attribute)
    expect(tooltip).toContain("data-void-model-tooltip")
    expect(css()).toContain("[data-void-model-picker]")
    expect(css()).toContain("[data-void-model-tooltip]")
  })

  test("hides upstream branding under void only", () => {
    for (const needle of [
      '[data-slot="view-more-providers"]',
      '[data-provider-id="opencode"]',
      '[data-provider-id="opencode-go"]',
    ])
      expect(body(needle)).toContain("display: none")
    for (const rule of rules()) if (rule.body.includes("display: none")) for (const s of rule.selectors) expect(s.startsWith(prefix)).toBe(true)
  })

  test("keeps the free models title visible and unbranded under void", () => {
    expect(css()).not.toContain("free-models-title")
    for (const source of [picker, pickerV1]) {
      expect(source).toContain("freeModelsTitleKey(theme.themeId())")
      expect(source).not.toContain('t("dialog.model.unpaid.freeModels.title")')
    }
  })

  test("the v1 dialog carries the same data attributes and hides the upstream provider rows", () => {
    for (const attribute of ["data-void-model-picker", 'data-slot="add-more-models"', "data-provider-id={i.id}"])
      expect(pickerV1).toContain(attribute)
    expect(body('[data-slot="list-item"]:has([data-provider-id="opencode"])')).toContain("display: none")
    expect(body('[data-slot="list-item"]:has([data-provider-id="opencode-go"])')).toContain("display: none")
  })

  test("is a 20px glass dialog with 14px option rows and a pill-selected row", () => {
    expect(css()).toContain("var(--void-glass)")
    expect(css()).toContain("var(--void-radius-card)")
    expect(body('[data-slot="model-option"]')).toContain("var(--void-radius-control)")
    expect(body('[data-slot="model-option"][data-selected]')).toContain("var(--void-pill)")
    expect(body('[data-slot="model-option"][data-selected]')).toContain("var(--void-pill-text)")
    expect(body('[data-component="tag"]')).toContain("var(--void-radius-chip)")
    expect(body('[data-slot="add-more-models"]')).toContain("var(--void-inner)")
    expect(body('[data-slot="add-more-models"]')).toContain("var(--void-radius-control)")
  })

  test("styles the tooltip as a raised surface with room and a wrapping model name", () => {
    const tip = body("[data-void-model-tooltip]")
    expect(css()).toContain("var(--void-raised)")
    expect(css()).toContain("var(--void-radius-inner)")
    expect(tip).toContain("padding")
    expect(css()).toContain("white-space: normal")
    expect(picker).toContain("gutter={")
  })

  test("uses only readable secondary text tokens", () => {
    expect(css()).not.toContain("--void-text-3")
    expect(css()).toContain("var(--void-text-2)")
  })
})
