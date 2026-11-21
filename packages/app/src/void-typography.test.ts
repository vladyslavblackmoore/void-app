import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const path = new URL("../../ui/src/styles/void/typography.css", import.meta.url)

function declarations(selector: string) {
  const css = readFileSync(path, "utf8")
  const found = new Map<string, string>()
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(",").map((part) => part.trim())
    if (!selectors.includes(selector)) continue
    for (const line of match[2]!.split(";")) {
      const index = line.indexOf(":")
      if (index < 0) continue
      found.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
    }
  }
  return found
}

describe("void typography", () => {
  test("maps the sans families to Outfit under the void theme only", () => {
    expect(existsSync(path)).toBe(true)
    const css = readFileSync(path, "utf8")
    for (const match of css.matchAll(/([^{}]+)\{/g)) {
      for (const part of match[1]!.split(",")) expect(part.trim().startsWith('html[data-theme="void"]')).toBe(true)
    }
    const rules = declarations('html[data-theme="void"]')
    expect(rules.get("--font-family-sans")).toBe("var(--void-font)")
    expect(rules.get("--v2-font-family-sans")).toBe("var(--void-font)")
    expect(css).not.toContain("body {\n  --font-family-sans")
  })

  test("uses weight 300 as the base and leaves monospace alone", () => {
    const css = readFileSync(path, "utf8")
    expect(declarations('html[data-theme="void"] body').get("font-weight")).toBe("var(--void-weight-thin)")
    expect(declarations('html[data-theme="void"] body').has("--font-family-sans")).toBe(false)
    expect(css).not.toContain("mono")
  })

  test("lets a user-chosen sans font win over the void default", () => {
    const settings = readFileSync(new URL("./context/settings.tsx", import.meta.url), "utf8")
    expect(settings).toContain("removeProperty(\"--font-family-sans\")")
  })

  test("is imported by the app stylesheet", () => {
    expect(readFileSync(new URL("./index.css", import.meta.url), "utf8")).toContain("styles/void/typography.css")
  })
})
