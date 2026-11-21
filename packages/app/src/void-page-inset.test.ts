import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const prefix = 'html[data-theme="void"] '

const pages = [
  { name: "overview", file: "./pages/home/void-overview.css", selector: '[data-component="void-overview"]' },
  { name: "hub", file: "./components/void/hub.css", selector: '[data-component="void-hub"]' },
  { name: "agents", file: "./components/agents/agents-diagram.css", selector: '[data-component="agents-canvas"]' },
  { name: "settings and models", file: "./components/settings-v2/settings-v2.css", selector: ".void-settings-page" },
]

function insetRules(css: string) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1]!.trim(), body: match[2]! }))
    .filter((rule) => rule.body.includes("--void-page-inset"))
}

describe("void page inset", () => {
  test("defines the token once in the void token sheet", () => {
    const css = read("../../ui/src/styles/void/tokens.css")
    expect(css.match(/--void-page-inset:/g)?.length).toBe(1)
  })

  for (const page of pages) {
    test(`${page.name} header container uses the token under the void theme only`, () => {
      const rules = insetRules(read(page.file))
      expect(rules.length).toBeGreaterThan(0)
      for (const rule of rules) {
        expect(rule.selector.startsWith(prefix + page.selector)).toBe(true)
        expect(rule.body).toMatch(/padding-left: var\(--void-page-inset\)/)
      }
    })
  }
})
