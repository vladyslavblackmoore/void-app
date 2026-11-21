import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"]'

function rules() {
  const css = readFileSync(new URL("appearance.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

const body = (needle: string) =>
  rules()
    .filter((rule) => rule.selectors.some((selector) => selector.includes(needle)))
    .map((rule) => rule.body)
    .join("\n")

describe("void appearance switches", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("appearance.css", dir))).toBe(true)
    expect(readFileSync(new URL("appearance.css", dir), "utf8")).not.toContain("/*")
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("canvas glows and the dot grid hide their pseudo layers", () => {
    expect(body('[data-void-glows="off"]')).toContain("display: none")
    expect(body('[data-void-glows="off"] [data-component="void-canvas"]::after')).not.toBe("")
    expect(body('[data-void-grid="off"] [data-component="void-canvas"]::before')).toContain("display: none")
  })

  test("reduced motion stops animations and transitions", () => {
    const reduced = body('[data-void-motion="reduced"]')
    expect(reduced).toContain("animation-duration: 0.001ms !important")
    expect(reduced).toContain("transition-duration: 0.001ms !important")
  })

  test("compact density tightens the gaps and the card padding", () => {
    const compact = body('[data-void-density="compact"]')
    expect(compact).toContain("--void-gap: 10px")
    expect(compact).toContain("--void-gap-sm: 6px")
    expect(compact).toContain("--void-pad-card: 12px")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/appearance.css")
  })
})
