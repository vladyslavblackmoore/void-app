import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const sources = [
  "../../../../session-ui/src/components/message-part.css",
  "../../../../session-ui/src/components/message-part.tsx",
  "../../../../session-ui/src/components/basic-tool.tsx",
  "../../../../session-ui/src/components/dock-prompt.tsx",
  "../../components/dock-surface.tsx",
  "../../components/button.tsx",
]

function rules() {
  const css = readFileSync(new URL("chat.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.replace(/\s+/g, " ").trim()),
    body: match[2]!.trim(),
  }))
}

describe("void chat messages", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("chat.css", dir))).toBe(true)
    expect(readFileSync(new URL("chat.css", dir), "utf8")).not.toContain("/*")
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
      const text = attribute.slice(1, -1)
      expect(upstream).toContain(text.startsWith("data-variant") ? "data-variant" : text)
    }
  })

  test("uses a white user bubble, an inner agent bubble and a yellow permission border", () => {
    const css = readFileSync(new URL("chat.css", dir), "utf8")
    expect(css).toContain("var(--void-pill)")
    expect(css).toContain("var(--void-inner)")
    expect(css).toContain("var(--void-radius-bubble)")
    expect(css).toContain("var(--void-warn-border)")
    expect(css).toContain("var(--void-font-mono)")
  })

  test("orders the permission actions as allow once, allow always, deny", () => {
    const css = readFileSync(new URL("chat.css", dir), "utf8")
    expect(css).toContain("flex-direction: row-reverse")
  })
})
