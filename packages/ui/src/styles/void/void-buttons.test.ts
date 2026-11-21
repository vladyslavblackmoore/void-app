import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const prefix = 'html[data-theme="void"] '

function rules(name: string) {
  const css = readFileSync(new URL(name, dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(/,\s*\n/).map((selector) => selector.trim()),
    body: match[2]!.trim(),
  }))
}

describe("void buttons", () => {
  test("exists, has no comments and scopes every selector to the void theme", () => {
    expect(existsSync(new URL("buttons.css", dir))).toBe(true)
    expect(readFileSync(new URL("buttons.css", dir), "utf8")).not.toContain("/*")
    const all = rules("buttons.css")
    expect(all.length).toBeGreaterThan(5)
    for (const rule of all) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("targets variants that exist upstream", () => {
    const upstream = readFileSync(new URL("../../v2/components/button-v2.css", dir), "utf8")
    const attributes = new Set<string>()
    for (const rule of rules("buttons.css")) {
      for (const selector of rule.selectors) {
        for (const match of selector.slice(prefix.length).matchAll(/\[data-[a-z-]+="[a-z0-9-]+"\]/g)) attributes.add(match[0])
      }
    }
    expect(attributes.size).toBeGreaterThan(3)
    for (const attribute of attributes) expect(upstream).toContain(attribute)
  })

  test("maps contrast to the white primary, neutral to the secondary and ghost to transparent", () => {
    const css = readFileSync(new URL("buttons.css", dir), "utf8")
    const block = (variant: string) =>
      rules("buttons.css").find((rule) =>
        rule.selectors.includes(`${prefix}[data-component="button-v2"][data-variant="${variant}"]`),
      )?.body ?? ""
    expect(block("contrast")).toContain("background-color: var(--void-pill)")
    expect(block("contrast")).toContain("color: var(--void-pill-text)")
    expect(block("neutral")).toContain("background-color: var(--void-inner)")
    expect(block("ghost")).toContain("background-color: transparent")
    expect(css).toContain("var(--void-hover-pill)")
    expect(css).toContain("var(--void-raised)")
  })

  test("disabled buttons of every variant use the void disabled opacity", () => {
    const body =
      rules("buttons.css").find((rule) =>
        rule.selectors.includes(`${prefix}[data-component="button-v2"]:is(:disabled, [data-state="disabled"])`),
      )?.body ?? ""
    expect(body).toContain("opacity: var(--void-disabled-opacity)")
    expect(body).toContain("cursor: not-allowed")
  })

  test("the light secondary button has a visible edge", () => {
    const neutral = `${prefix}[data-component="button-v2"][data-variant="neutral"]`
    const bodies = rules("buttons.css").filter((rule) => rule.selectors.includes(neutral))
    expect(bodies.some((rule) => rule.body.includes("box-shadow: var(--void-button-edge)"))).toBe(true)
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    expect(tokens).toContain("--void-button-edge: none")
    expect(tokens).toContain("--void-button-edge: inset 0 0 0 1px var(--void-border-strong)")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/buttons.css")
  })
})
