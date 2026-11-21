import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("./agents-diagram.css", import.meta.url), "utf8")
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
  body: match[2]!.trim(),
}))
const light = 'html[data-theme="void"][data-color-scheme="light"]'

function bodyOf(selector: string) {
  return rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join("\n")
}

describe("agents screen void styles", () => {
  test("has no comments", () => {
    expect(css).not.toContain("/*")
  })

  test("other and haiku tags use one token in both themes", () => {
    expect(bodyOf(`${light} [data-slot="agents-model-tag"][data-kind="other"]`)).toBe("")
    const base = 'html[data-theme="void"] [data-slot="agents-model-tag"]'
    expect(bodyOf(`${base}[data-kind="haiku"]`)).toContain("var(--void-model-tier-other)")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-node"] [data-slot="agents-model-tag"]')).toContain(
      "var(--void-model-tier-other)",
    )
  })

  test("tags use the on-tag text colour", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-node"] [data-slot="agents-model-tag"]')).toContain(
      "color: var(--void-on-tag)",
    )
  })

  test("legend and panel body are styled", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-legend"]')).toContain("background")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-meta"]')).toContain("color")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-body"]')).toContain("overflow-y")
  })

  test("effort value is bold and chip text is readable", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-node"] [data-slot="agents-chip"] strong')).toContain(
      "font-weight",
    )
    expect(bodyOf('html[data-theme="void"] [data-component="agents-node"] [data-slot="agents-chip"]')).toContain(
      "color: var(--void-text-1)",
    )
  })

  test("effort segments size to their content", () => {
    const body = bodyOf(
      'html[data-theme="void"] [data-component="agents-panel"] [data-slot="segmented-control-v2-item"]',
    )
    expect(body).toContain("flex: 1 1 auto")
    expect(body).toContain("min-width: max-content")
    expect(body).toContain("padding: 0 8px")
  })

  test("active links are dashed in green and blue", () => {
    const base = 'html[data-theme="void"] [data-component="agents-canvas"] [data-slot="agents-link"]'
    expect(bodyOf(`${base}[data-state="ok"]`)).toContain("stroke: var(--void-green)")
    expect(bodyOf(`${base}[data-state="ok"]`)).toContain("stroke-dasharray")
    expect(bodyOf(`${base}[data-state="busy"]`)).toContain("stroke: var(--void-blue)")
    expect(bodyOf(`${base}[data-state="busy"]`)).toContain("stroke-dasharray")
  })

  test("editor panel is 400 wide and in flow beside the map", () => {
    const body = bodyOf('html[data-theme="void"] [data-component="agents-panel"]')
    expect(body).toContain("width: var(--void-panel-w-lg, 400px)")
    expect(body).toContain("position: relative")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-stage"]')).toContain("display: flex")
  })

  test("node descriptions and editor labels use text-2", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-node"] [data-slot="agents-description"]')).toContain(
      "color: var(--void-text-2)",
    )
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-label"]')).toContain(
      "color: var(--void-text-2)",
    )
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-meta"]')).toContain(
      "color: var(--void-text-2)",
    )
  })

  test("zoom rail and map scaling are styled", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-rail"]')).toContain("background")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-rail"] button')).toContain("width")
    expect(bodyOf('[data-component="agents-map"]')).toContain("transform-origin")
  })
})
