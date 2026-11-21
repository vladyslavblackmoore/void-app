import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '
const sources = [
  "../../../../session-ui/src/v2/components/prompt-input/index.tsx",
  "../../../../app/src/pages/session/composer/session-composer-region.tsx",
  "../../../../app/src/components/prompt-input-v2.tsx",
  "../../v2/components/button-v2.tsx",
  "../../v2/components/segmented-control-v2.tsx",
  "../../v2/components/menu-v2.css",
  "../../../../app/src/pages/new-session/new-session-view.tsx",
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
      const value = attribute.match(/^\[data-select="([a-z]+)"\]$/)?.[1]
      if (value) {
        expect(upstream).toContain("data-select={props.kind}")
        expect(upstream).toContain(`kind="${value}"`)
        continue
      }
      const menu = attribute.match(/^\[data-menu="([a-z-]+)"\]$/)?.[1]
      if (menu) {
        expect(upstream).toContain("data-menu={")
        expect(upstream).toContain(`"${menu}"`)
        continue
      }
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
  test("lets the dock controls wrap and keeps the model chip and effort labels at their full width", () => {
    const body = (needle: string) => rules().find((rule) => rule.selectors.some((s) => s.includes(needle)))?.body ?? ""
    expect(body("> div:last-of-type > div:first-child")).toContain("flex-wrap: wrap")
    expect(body('[data-action="prompt-model"]')).toContain("max-width: none")
    expect(body('[data-action="prompt-model"]')).toContain("flex: none")
    expect(body('[data-slot="segmented-control-v2"]')).toContain("width: auto")
    expect(body('[data-slot="segmented-control-v2-item"]')).toContain("flex: none")
    expect(body('[data-slot="segmented-control-v2-item"]')).toContain("min-width: max-content")
    expect(body('[data-slot="segmented-control-v2-item-label"]')).toContain("overflow: visible")
  })

  test("bottom-anchors the empty-chat dock at 680px", () => {
    const body = (needle: string) => rules().find((rule) => rule.selectors.some((s) => s.endsWith(needle)))?.body ?? ""
    expect(body('[data-component="session-new-design"] > div:first-child')).toContain("bottom: 26px")
    expect(body('[data-component="session-new-design"] > div:first-child')).toContain("top: auto")
    expect(body('[data-component="session-new-design"] > div:first-child > div')).toContain("max-width: 680px")
  })

  test("shows a neutral dot before the agent name and never adds a mic", () => {
    const css = readFileSync(new URL("dock.css", dir), "utf8")
    expect(css).toContain('[data-select="agent"]::before')
    expect(css).not.toContain("mic")
  })

  test("fades the disabled send pill instead of greying it", () => {
    const body = rules().find((rule) =>
      rule.selectors.some((s) => s.endsWith('[data-action="prompt-submit"]:disabled')),
    )?.body
    expect(body).toContain("background-color: var(--void-pill)")
    expect(body).toContain("color: var(--void-pill-text)")
    expect(body).toContain("opacity: 0.4")
  })

  test("styles the agent and plus menus as glass with trigger-wide min-width, 14px rows and pill selection", () => {
    const find = (needle: string) =>
      rules().find((rule) => rule.selectors.some((s) => s.endsWith(needle)))?.body ?? ""
    const menu = rules().find((rule) => rule.selectors.join() === prefix + '[data-menu="prompt-add"]')?.body ?? ""
    expect(menu).toContain("min-width: max(var(--kb-popper-anchor-width), 200px)")
    const select = rules().find((rule) => rule.selectors.includes(prefix + '[data-menu="prompt-select"]'))?.body ?? ""
    expect(select).toContain("min-width: var(--kb-popper-anchor-width)")
    expect(select).toContain("var(--void-glass)")
    expect(select).toContain("var(--void-radius-card)")
    expect(find('[data-menu="prompt-select"] [data-component="menu-v2-item"]')).toContain("var(--void-radius-inner)")
    expect(find('[data-menu="prompt-select"] [data-component="menu-v2-item"][data-highlighted]')).toContain(
      "var(--void-hover)",
    )
    expect(find('[data-menu="prompt-select"] [data-component="menu-v2-item"][data-checked]')).toContain(
      "var(--void-pill)",
    )
  })
})
