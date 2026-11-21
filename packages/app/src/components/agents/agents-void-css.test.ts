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

  test("light tag fills stay bright with dark text", () => {
    const body = bodyOf(`${light} [data-slot="agents-model-tag"][data-kind="other"]`)
    expect(body).toContain("background:")
    expect(body).not.toContain("var(--void-blue)")
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
})
