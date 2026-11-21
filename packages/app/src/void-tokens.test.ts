import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const tokens = () => read("../../ui/src/styles/void/tokens.css")

function rules(css: string) {
  const out: { selector: string; body: string; media: string | undefined }[] = []
  const walk = (text: string, media: string | undefined) => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf("{", i)
      if (open < 0) break
      const head = text.slice(i, open).trim()
      let depth = 1
      let j = open + 1
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++
        if (text[j] === "}") depth--
        j++
      }
      const body = text.slice(open + 1, j - 1)
      if (head.startsWith("@media")) walk(body, head)
      else out.push({ selector: head, body, media })
      i = j
    }
  }
  walk(css, undefined)
  return out
}

describe("void tokens", () => {
  test("defines the void token set only under the void selector", () => {
    expect(existsSync(new URL("../../ui/src/styles/void/tokens.css", import.meta.url))).toBe(true)
    const css = tokens()
    const all = rules(css)
    expect(all.length).toBeGreaterThan(1)
    for (const rule of all) {
      for (const part of rule.selector.split(",")) expect(part.trim().startsWith('html[data-theme="void"]')).toBe(true)
    }
    const declared = [...css.matchAll(/(--void-[a-z0-9-]+)\s*:/g)].map((match) => match[1])
    for (const name of [
      "--void-font",
      "--void-bg",
      "--void-card",
      "--void-inner",
      "--void-text-1",
      "--void-text-2",
      "--void-pill",
      "--void-glass",
      "--void-green",
      "--void-blue",
      "--void-yellow",
      "--void-red",
      "--void-glow-violet",
      "--void-glow-blue",
      "--void-radius-control",
      "--void-radius-card",
      "--void-radius-dock",
    ]) {
      expect(declared).toContain(name)
    }
  })

  test("keeps every void token inside the scoped sheet", () => {
    const outside = rules(tokens()).filter((rule) => !rule.selector.includes('html[data-theme="void"]'))
    expect(outside).toEqual([])
  })

  test("ships the Outfit font file, its license and the face rule", () => {
    expect(existsSync(new URL("../public/assets/Outfit.ttf", import.meta.url))).toBe(true)
    const license = read("../public/assets/Outfit-OFL.txt")
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1")
    const css = read("./index.css")
    expect(css).toContain('font-family: "Outfit"')
    expect(css).toContain("/assets/Outfit.ttf")
    expect(css).toContain("styles/void/tokens.css")
    expect(css).not.toMatch(/https?:\/\/[^"')]*font/)
  })
})
