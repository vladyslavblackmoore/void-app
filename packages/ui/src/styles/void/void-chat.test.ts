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
  "../../components/card.tsx",
  "../../../../app/src/pages/session.tsx",
  "../../../../app/src/pages/session/timeline/message-timeline.tsx",
  "../../../../app/src/pages/new-session/new-session-view.tsx",
  "../../../../app/src/pages/new-session.tsx",
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
      const value = text.match(/="([a-z0-9-]+)"/)?.[1]
      const expected = text.startsWith("data-variant") ? "data-variant" : text
      expect(upstream.includes(expected) || (value !== undefined && upstream.includes(`"${value}"`))).toBe(true)
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

  test("renders thread errors as the error banner without the upstream rule", () => {
    const css = readFileSync(new URL("chat.css", dir), "utf8")
    const rule = rules().find((item) => item.selectors.some((selector) => selector.endsWith('[data-variant="error"]')))
    expect(rule?.body).toContain("var(--void-error-bg)")
    expect(rule?.body).toContain("var(--void-error-border)")
    expect(rule?.body).toContain("var(--void-radius-inner)")
    expect(css).toContain('[data-variant="error"]::before')
  })

  test("turns the thread column into a glass sheet with a transparent frame", () => {
    const rule = rules().find((item) => item.selectors.some((selector) => selector.endsWith('[data-slot="void-session-main"]')))
    expect(rule?.body).toContain("var(--void-glass)")
    expect(rule?.body).toContain("var(--void-border)")
    expect(rule?.body).toContain("var(--void-radius-sheet)")
    expect(rule?.body).toContain("backdrop-filter")
    const frame = rules().find((item) => item.selectors.some((selector) => selector.endsWith('[data-component="session-panel-frame"]')))
    expect(frame?.body).toContain("background: transparent")
  })

  test("lets the canvas show through the empty chat", () => {
    const rule = rules().find((item) => item.selectors.some((selector) => selector.endsWith('[data-component="session-new-design"]')))
    expect(rule?.body).toContain("background: transparent")
  })

  test("keeps chat meta text at text-2 or darker", () => {
    const css = readFileSync(new URL("chat.css", dir), "utf8")
    expect(css).not.toContain("var(--void-text-3)")
    expect(css).toContain('[data-slot="user-message-label"]')
  })

  test("labels the user bubble and the sessions search with the markup it targets", () => {
    const part = readFileSync(new URL("../../../../session-ui/src/components/message-part.tsx", dir), "utf8")
    expect(part).toContain('data-slot="user-message-label"')
    const list = readFileSync(new URL("../../../../app/src/pages/session/void-session-list.tsx", dir), "utf8")
    expect(list).toContain('data-slot="void-sheet-search-wrap"')
    expect(list).toContain("<circle")
  })

  test("anchors the empty chat dock to the bottom of the thread column", () => {
    const rule = rules().find((item) =>
      item.selectors.some((selector) => selector.endsWith('[data-slot="void-session-main"] [data-slot="new-session-dock"]')),
    )
    expect(rule?.body).toContain("top: auto")
    expect(rule?.body).toContain("bottom:")
    const page = readFileSync(new URL("../../../../app/src/pages/new-session.tsx", dir), "utf8")
    expect(page).toContain("VoidSessionList")
    expect(page).toContain("VoidRunDetails")
    expect(page).toContain('data-slot="void-session-main"')
  })
})
