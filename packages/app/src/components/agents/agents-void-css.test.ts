import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("./agents-diagram.css", import.meta.url), "utf8")
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
  body: match[2]!.trim(),
}))

function bodyOf(selector: string) {
  return rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join("\n")
}

describe("agents screen void styles", () => {
  test("has no comments", () => {
    expect(css).not.toContain("/*")
  })

  test("panel body and meta are styled", () => {
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-meta"]')).toContain("color")
    expect(bodyOf('html[data-theme="void"] [data-component="agents-panel"] [data-slot="agents-body"]')).toContain("overflow-y")
  })})
