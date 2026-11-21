import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const sources = [
  "../../../../session-ui/src/v2/components/prompt-input/index.tsx",
  "../../../../app/src/pages/session/composer/session-composer-region.tsx",
  "../../../../app/src/components/prompt-input-v2.tsx",
  "../../v2/components/button-v2.tsx",
]

function rules() {
  const css = readFileSync(new URL("dock.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

describe("void chat dock", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("dock.css", dir))).toBe(true)
    expect(readFileSync(new URL("dock.css", dir), "utf8")).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(5)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("targets attributes that exist upstream", () => {
    const upstream = sources.map((name) => readFileSync(new URL(name, dir), "utf8")).join("\n")
    const attributes = new Set<string>()
    for (const rule of rules()) {
      for (const selector of rule.selectors) {
        for (const match of selector.slice(prefix.length).matchAll(/\[data-[a-z-]+(="[a-z0-9-]+")?\]/g)) {
          attributes.add(match[0])
        }
      }
    }
    expect(attributes.size).toBeGreaterThan(3)
    for (const attribute of attributes) {
      expect(upstream).toContain(attribute.slice(1, -1))
    }
  })

  test("is a 680px glass dock with a 24px radius and a 44px white send button", () => {
    const css = readFileSync(new URL("dock.css", dir), "utf8")
    expect(css).toContain("max-width: 680px")
    expect(css).toContain("var(--void-radius-dock)")
    expect(css).toContain("var(--void-glass)")
    expect(css).toContain("width: 44px")
    expect(css).toContain("var(--void-pill)")
  })
})
