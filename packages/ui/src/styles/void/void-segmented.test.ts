import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '

function rules() {
  const css = readFileSync(new URL("segmented.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

describe("void segmented control", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("segmented.css", dir))).toBe(true)
    expect(readFileSync(new URL("segmented.css", dir), "utf8")).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(3)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("targets slots that exist upstream", () => {
    const upstream = readFileSync(new URL("../../v2/components/segmented-control-v2.css", dir), "utf8")
    const attributes = new Set<string>()
    for (const rule of rules()) {
      for (const selector of rule.selectors) {
        for (const match of selector.slice(prefix.length).matchAll(/\[data-[a-z-]+(="[a-z0-9-]+")?\]/g)) {
          attributes.add(match[0])
        }
      }
    }
    expect(attributes.size).toBeGreaterThan(2)
    for (const attribute of attributes) expect(upstream).toContain(attribute)
  })

  test("draws one track with a white active segment", () => {
    const body = (needle: string) => rules().find((rule) => rule.selectors.some((s) => s.includes(needle)))?.body ?? ""
    expect(body('[data-slot="segmented-control-v2"]')).toContain("background: var(--void-inner)")
    expect(body(":where([data-pressed])")).toContain("background: var(--void-pill)")
    expect(body(":where([data-pressed])")).toContain("color: var(--void-pill-text)")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/segmented.css")
  })
})
