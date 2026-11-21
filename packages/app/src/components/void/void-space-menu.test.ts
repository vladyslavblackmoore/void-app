import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const menu = readFileSync(new URL("void-space-menu.css", dir), "utf8")
const bar = readFileSync(new URL("void-titlebar.css", dir), "utf8")
const prefix = 'html[data-theme="void"] '

describe("void space menu and top bar styles", () => {
  test("every menu selector is scoped to the void theme and has no comments", () => {
    expect(menu).not.toContain("/*")
    const selectors = [...menu.matchAll(/([^{}]+)\{/g)].flatMap((match) => match[1]!.split(",").map((item) => item.trim()))
    expect(selectors.length).toBeGreaterThan(8)
    for (const selector of selectors) expect(selector.startsWith(prefix)).toBe(true)
  })

  test("the menu is 264px wide with a white selected pill and status dots", () => {
    expect(menu).toContain("width: 264px")
    expect(menu).toContain("[data-void-selected]")
    expect(menu).toContain("background: var(--void-pill)")
    for (const state of ["running", "starting", "failed"]) expect(menu).toContain(`[data-state="${state}"]`)
  })

  test("the bar uses the 44px controls and the page gutter on both sides", () => {
    expect(bar).toContain("padding-left: var(--void-bar-lead, var(--void-gutter))")
    expect(bar).toContain("padding-right: var(--void-gutter)")
    expect(bar).toContain("height: var(--void-control-h)")
    expect(bar).not.toContain("--void-inset")
  })
})
