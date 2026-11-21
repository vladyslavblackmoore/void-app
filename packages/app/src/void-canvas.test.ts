import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const css = () => readFileSync(new URL("../../ui/src/styles/void/canvas.css", import.meta.url), "utf8")

describe("void canvas", () => {
  test("scopes the grid and glow layers to the void theme and the canvas root", () => {
    expect(existsSync(new URL("../../ui/src/styles/void/canvas.css", import.meta.url))).toBe(true)
    const source = css()
    for (const match of source.matchAll(/([^{}]+)\{/g)) {
      for (const part of match[1]!.split(",")) {
        expect(part.trim().startsWith('html[data-theme="void"] [data-component="void-canvas"]')).toBe(true)
      }
    }
    expect(source).toContain("::before")
    expect(source).toContain("::after")
    expect(source).toContain("pointer-events: none")
    expect(source).toContain("var(--void-dot)")
    expect(source).toContain("var(--void-dot-size)")
    expect(source).toContain("var(--void-glow-violet)")
    expect(source).toContain("var(--void-glow-blue)")
    expect(source).not.toContain("/*")
  })

  test("clears the opaque titlebar and page surfaces so the canvas shows through", () => {
    const source = css()
    const root = 'html[data-theme="void"] [data-component="void-canvas"]'
    expect(source).toContain(`${root} > [data-slot="titlebar-v2"]`)
    expect(source).toContain(`${root} > main > .bg-v2-background-bg-base`)
    expect(source).toMatch(/background-color: transparent;/)
  })

  test("marks the new layout root and keeps the existing background utility", () => {
    const layout = readFileSync(new URL("./pages/layout-new.tsx", import.meta.url), "utf8")
    expect(layout).toContain('data-component="void-canvas"')
    expect(layout).toContain("bg-v2-background-bg-deep")
  })

  test("is imported by the app stylesheet", () => {
    expect(readFileSync(new URL("./index.css", import.meta.url), "utf8")).toContain("styles/void/canvas.css")
  })
})
