import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("./settings-v2.css", import.meta.url), "utf8")
const tokens = readFileSync(new URL("../../../../ui/src/styles/void/tokens.css", import.meta.url), "utf8")

function block(selector: string) {
  const start = css.lastIndexOf(`\n${selector} {`)
  if (start < 0) return ""
  return css.slice(start, css.indexOf("}", start))
}

const content = 'html[data-theme="void"] .void-settings-content'

describe("void settings css", () => {
  test("the core server dot uses the void status colours", () => {
    const lead = `${content} .settings-v2-servers-lead`
    expect(block(`${lead} > .bg-icon-success-base`)).toContain("background-color: var(--void-green)")
    expect(block(`${lead} > .bg-icon-critical-base`)).toContain("background-color: var(--void-red)")
    expect(block(`${lead} > .bg-border-weak-base`)).toContain("background-color: var(--void-text-3)")
  })

  test("the light green meets 3:1 on the inner surface", () => {
    const light = tokens.slice(tokens.indexOf('html[data-theme="void"][data-color-scheme="light"]'))
    expect(light).toContain("--void-green: #0f7634")
    expect(light).toContain("--void-inner: #f3f4f6")
  })

  test("shortcut sections stack in one block with the card gap", () => {
    const shortcuts = block(`${content} .settings-v2-shortcuts`)
    expect(shortcuts).toContain("display: block")
    expect(shortcuts).toContain("gap: 0")
    const section = block(`${content} .settings-v2-section`)
    expect(section).toContain("margin-bottom: var(--void-gap, 14px)")
    expect(section).toContain("break-inside: avoid")
  })

  test("the general page lays out two columns with the card gap", () => {
    const grid = block(`${content} .settings-v2-tab-body.void-general`)
    expect(grid).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))")
    expect(grid).toContain("gap: var(--void-gap, 14px)")
    expect(block('html[data-theme="void"] .void-general-col')).toContain("gap: var(--void-gap, 14px)")
  })

  test("the default tag is a small muted chip and the data path is monospace", () => {
    const tag = block('html[data-theme="void"] .void-space-tag')
    expect(tag).toContain("flex: none")
    expect(tag).toContain("color: var(--void-text-2)")
    expect(block('html[data-theme="void"] .void-data-path')).toContain("font-family: var(--font-family-mono)")
  })

  test("shortcut key hints are readable", () => {
    const hint = block(`${content} .settings-v2-keybind-button`)
    expect(hint).toContain("font-size: 13px")
    expect(hint).toContain("color: var(--void-text-2)")
  })

  test("the data path is legible", () => {
    const path = block('html[data-theme="void"] .void-data-path')
    expect(path).toContain("font-size: 13px")
    expect(path).toContain("color: var(--void-text-1)")
  })

  test("the scroller fades its top and bottom edges instead of clipping hard", () => {
    const scroller = block(content)
    expect(scroller).toContain("mask-image: linear-gradient(")
    expect(scroller).toContain("transparent 0")
    expect(scroller).toContain("transparent 100%")
  })

  test("the search field is a void input", () => {
    const input = block(`${content} .settings-v2-tab-search [data-component="text-input-v2"]`)
    expect(input).toContain("background: var(--void-inner)")
    expect(input).toContain("height: var(--void-control-h, 44px)")
    expect(block(`${content} .settings-v2-tab-search [data-component="text-input-v2"]:focus-within`)).toContain(
      "var(--void-focus-ring)",
    )
  })

  test("the scroller no longer pads its own bottom", () => {
    expect(block(content)).not.toContain("padding-bottom")
  })
})
