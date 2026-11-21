import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const sources = [
  "../../v2/components/menu-v2.css",
  "../../v2/components/select-v2.css",
  "../../components/popover.css",
  "../../components/dropdown-menu.css",
]

function rules() {
  const css = readFileSync(new URL("glass.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

describe("void glass surfaces", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("glass.css", dir))).toBe(true)
    expect(readFileSync(new URL("glass.css", dir), "utf8")).not.toContain("/*")
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
    expect(attributes.size).toBeGreaterThan(8)
    for (const attribute of attributes) expect(upstream).toContain(attribute)
  })

  test("covers the menu, the select list, the popover and the v1 dropdown", () => {
    const css = readFileSync(new URL("glass.css", dir), "utf8")
    for (const name of ["menu-v2-content", "select-v2-content", "popover-content", "dropdown-menu-content"]) {
      expect(css).toContain(`"${name}"`)
    }
  })

  test("uses the glass fill, the blur and a white selected row", () => {
    const css = readFileSync(new URL("glass.css", dir), "utf8")
    expect(css).toContain("background: var(--void-glass)")
    expect(css).toContain("backdrop-filter: blur(var(--void-blur))")
    expect(css).toContain("var(--void-radius-card)")
    expect(css).toContain("background: var(--void-pill)")
    expect(css).toContain("color: var(--void-pill-text)")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/glass.css")
  })
})

describe("popover v2", () => {
  test("ships a component, a stylesheet and a story", () => {
    const v2 = new URL("../../v2/components/", dir)
    for (const name of ["popover-v2.tsx", "popover-v2.css", "popover-v2.stories.tsx"]) {
      expect(existsSync(new URL(name, v2))).toBe(true)
    }
    expect(readFileSync(new URL("popover-v2.css", v2), "utf8")).toContain('[data-component="popover-v2-content"]')
  })
})
