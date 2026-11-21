import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '

function rules() {
  const css = readFileSync(new URL("page-title.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

const find = (needle: string) =>
  rules()
    .filter((rule) => rule.selectors.some((selector) => selector.includes(needle)))
    .map((rule) => rule.body)
    .join("\n")

describe("void page title block", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("page-title.css", dir))).toBe(true)
    expect(readFileSync(new URL("page-title.css", dir), "utf8")).not.toContain("/*")
    expect(rules().length).toBeGreaterThan(5)
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("covers the hub, settings and models, and agents title markup", () => {
    expect(find('[data-slot="void-hub-head"]')).not.toBe("")
    expect(find(".void-settings-head")).not.toBe("")
    expect(find('[data-component="agents-canvas"] > h2')).not.toBe("")
  })

  test("uses one fixed head height and padding for every page", () => {
    for (const needle of ['[data-slot="void-hub-head"]', ".void-settings-head", '[data-component="agents-canvas"]']) {
      const body = find(needle)
      expect(body).toContain("var(--void-page-title-pad)")
    }
    expect(find('[data-slot="void-hub-head"]')).toContain("height: var(--void-page-title-height)")
    expect(find(".void-settings-head")).toContain("height: var(--void-page-title-height)")
  })

  test("fixes the title line box and the subtitle gap", () => {
    expect(find('[data-slot="void-hub-title"]')).toContain("line-height: var(--void-page-title-line)")
    expect(find(".void-settings-title")).toContain("line-height: var(--void-page-title-line)")
    expect(find('[data-component="agents-canvas"] > h2')).toContain("line-height: var(--void-page-title-line)")
    expect(find('[data-slot="void-hub-sub"]')).toContain("margin-top: var(--void-page-title-gap)")
    expect(find(".void-settings-subtitle")).toContain("margin-top: var(--void-page-title-gap)")
    expect(find('[data-component="agents-canvas"] > p')).toContain("margin-top: var(--void-page-title-gap)")
  })

  test("derives the offsets from the mockup top and a 66px bar", () => {
    const css = readFileSync(new URL("page-title.css", dir), "utf8")
    expect(css).toContain("--void-page-title-pad: calc(var(--void-top) - 66px)")
    expect(css).toContain("--void-page-title-after: 21px")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/page-title.css")
  })
})
