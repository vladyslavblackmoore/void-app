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

function block(name: string, selector: string) {
  return rules(name).find((rule) => rule.selectors.includes(selector))?.body ?? ""
}

describe("void scroll containers", () => {
  test("exist, have no comments and scope every selector to the void theme", () => {
    for (const name of ["scroll.css", "controls.css"]) {
      expect(existsSync(new URL(name, dir))).toBe(true)
      expect(readFileSync(new URL(name, dir), "utf8")).not.toContain("/*")
      for (const rule of rules(name)) for (const selector of rule.selectors) expect(selector.startsWith(prefix)).toBe(true)
    }
  })

  test("the settings scroller pads for the card shadow on the sides and bottom", () => {
    const body = block("scroll.css", `${prefix}.void-settings-content`)
    expect(body).toContain("margin-inline: calc(var(--void-shadow-bleed) * -1)")
    expect(body).not.toMatch(/margin(-block|-top)?:\s*-/)
    expect(body).toContain("padding: 24px var(--void-shadow-bleed) var(--void-shadow-tail)")
    expect(body).toContain("pointer-events: none")
    expect(block("scroll.css", `${prefix}.void-settings-content > *`)).toContain("pointer-events: auto")
  })

  test("the settings nav paints above the scroller so card shadows are not cut on it", () => {
    const body = block("scroll.css", `${prefix}.void-settings-nav`)
    expect(body).toContain("position: relative")
    expect(body).toContain("z-index: 1")
  })

  test("the list-nav settings scroller pulls its top padding back so the cards start level with the nav", () => {
    const base = block("scroll.css", `${prefix}.void-settings-content`)
    const pad = Number(/padding: (\d+)px/.exec(base)?.[1])
    const pull = block("scroll.css", `${prefix}.void-settings-page[data-nav="list"] .void-settings-content`)
    expect(pad).toBeGreaterThan(0)
    expect(pull).toContain(`margin-top: -${pad}px`)
  })

  test("the hub scroller keeps room below the last card", () => {
    expect(block("scroll.css", `${prefix}[data-component="void-hub"]`)).toContain(
      "padding-bottom: var(--void-shadow-tail)",
    )
  })

  test("the bleed covers the shadow of every theme", () => {
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    const px = (name: string) => Number(new RegExp(`${name}: (\\d+)px`).exec(tokens)?.[1])
    expect(px("--void-shadow-bleed")).toBeGreaterThanOrEqual(28)
    expect(px("--void-shadow-tail")).toBeGreaterThanOrEqual(58)
    expect(tokens).toContain("--void-shadow: 0 18px 40px")
  })

  test("is imported by the app stylesheet", () => {
    const index = readFileSync(new URL("../../../../app/src/index.css", import.meta.url), "utf8")
    expect(index).toContain("styles/void/scroll.css")
    expect(index).toContain("styles/void/controls.css")
  })
})

describe("void disabled controls", () => {
  const light = () => {
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8")
    const start = tokens.indexOf('html[data-theme="void"][data-color-scheme="light"]')
    return tokens.slice(start)
  }

  test("light disabled opacity keeps the primary at 4.5:1 or better", () => {
    const opacity = Number(/--void-disabled-opacity: ([\d.]+)/.exec(light())?.[1])
    const mix = (channel: number, under: number) => opacity * channel + (1 - opacity) * under
    const lin = (value: number) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const lum = (value: number) => 0.2126 * lin(value) + 0.7152 * lin(value) + 0.0722 * lin(value)
    const background = lum(mix(0x11, 255))
    const text = lum(255)
    expect((text + 0.05) / (background + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  test("disabled switches are not faded into the track", () => {
    const control = block("controls.css", `${prefix}[data-component="switch"][data-disabled] [data-slot="switch-control"]`)
    expect(control).toContain("opacity: 1")
    expect(control).toContain("background: var(--void-raised)")
    expect(control).toContain("var(--void-border-strong)")
    const thumb = block("controls.css", `${prefix}[data-component="switch"][data-disabled] [data-slot="switch-thumb"]`)
    expect(thumb).toContain("var(--void-text-2)")
  })

  test("a disabled checked switch stays green and mostly opaque", () => {
    const control = block(
      "controls.css",
      `${prefix}[data-component="switch"][data-disabled][data-checked] [data-slot="switch-control"]`,
    )
    expect(control).toContain("background: var(--void-green)")
    expect(Number(/opacity: ([\d.]+)/.exec(control)?.[1])).toBeGreaterThanOrEqual(0.75)
  })
})
