import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const v2 = new URL("../../v2/components/", import.meta.url)
const prefix = 'html[data-theme="void"] '

function split(list: string) {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of list) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  parts.push(current.trim())
  return parts
}

function rules() {
  const css = readFileSync(new URL("radii.css", dir), "utf8")
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: split(match[1]!),
    body: match[2]!.trim(),
  }))
}

const upstream = () =>
  readdirSync(v2)
    .filter((name) => name.endsWith("-v2.css"))
    .map((name) => readFileSync(new URL(name, v2), "utf8"))
    .join("\n")

describe("void radii", () => {
  test("exists and holds only border-radius declarations", () => {
    expect(existsSync(new URL("radii.css", dir))).toBe(true)
    const all = rules()
    expect(all.length).toBeGreaterThan(5)
    for (const rule of all) {
      expect(rule.body).toMatch(/^border-radius: [0-9a-z%]+;$/)
    }
    expect(readFileSync(new URL("radii.css", dir), "utf8")).not.toContain("/*")
  })

  test("scopes every selector to the void theme", () => {
    for (const rule of rules()) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("targets the v2 components by selectors that exist upstream", () => {
    const source = upstream()
    const attributes = new Set<string>()
    for (const rule of rules()) {
      for (const selector of rule.selectors) {
        for (const match of selector.slice(prefix.length).matchAll(/\[data-[a-z-]+="[a-z0-9-]+"\]/g)) {
          attributes.add(match[0])
        }
      }
    }
    expect(attributes.size).toBeGreaterThan(10)
    for (const attribute of attributes) expect(source).toContain(attribute)
  })

  test("covers every targeted component", () => {
    const css = readFileSync(new URL("radii.css", dir), "utf8")
    for (const name of [
      "button-v2",
      "icon-button-v2",
      "tabs-v2",
      "segmented-control-v2",
      "text-input-v2",
      "select-v2",
      "menu-v2-content",
      "menu-v2-item",
      "dialog-v2",
      "switch",
    ]) {
      expect(css).toContain(`"${name}`)
    }
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/radii.css")
  })
})
