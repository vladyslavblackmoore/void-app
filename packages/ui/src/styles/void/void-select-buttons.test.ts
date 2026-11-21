import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("./controls.css", import.meta.url), "utf8")
const prefix = 'html[data-theme="void"] [data-component="select-v2"][data-appearance="inline"]'

function body(selector: string) {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) return ""
  return css.slice(start, css.indexOf("}", start))
}

describe("void inline selects", () => {
  test("render as a bordered raised select button", () => {
    const base = body(prefix)
    expect(base).toContain("background: var(--void-inner)")
    expect(base).toContain("inset 0 0 0 1px var(--void-border-strong)")
    expect(base).toContain("border-radius: var(--void-radius-control)")
    expect(base).toContain("min-height: 38px")
    expect(base).not.toContain("background: transparent")
  })

  test("keep a visible chevron and readable value text", () => {
    expect(body(`${prefix} [data-slot="select-v2-chevron"]`)).toContain("color: var(--void-text-2)")
    const text = body(`${prefix} [data-slot="select-v2-value-text"]`)
    expect(text).toContain("font-size: 13px")
    expect(text).toContain("color: var(--void-text-1)")
  })

  test("have hover, focus and disabled states", () => {
    expect(css).toContain(`${prefix}:where(:hover)`)
    expect(body(`${prefix}:where(:focus-within):not([data-disabled], [data-invalid])`)).toContain("var(--void-focus-ring)")
    const disabled = body(`${prefix}:where([data-disabled])`)
    expect(disabled).toContain("opacity: var(--void-disabled-opacity)")
    expect(disabled).toContain("cursor: not-allowed")
  })

  test("every selector is scoped to the void theme", () => {
    for (const match of css.matchAll(/^([^\s{}][^{}]*)\{/gm)) {
      for (const selector of match[1]!.split(/,\s*\n/)) expect(selector.trim().startsWith('html[data-theme="void"]')).toBe(true)
    }
  })
})
