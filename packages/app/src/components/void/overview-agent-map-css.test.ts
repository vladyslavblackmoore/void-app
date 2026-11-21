import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const css = readFileSync(new URL("./overview-agent-map.css", import.meta.url), "utf8")
const overview = readFileSync(new URL("../../pages/home/void-overview.css", import.meta.url), "utf8")

const body = (source: string, selector: string) => {
  const index = source.indexOf(selector + " {")
  return index < 0 ? "" : source.slice(index, source.indexOf("}", index))
}

describe("overview styles", () => {
  test("haiku tags use a model tier colour", () => {
    expect(body(css, 'html[data-theme="void"] [data-slot="void-agent-tag"][data-kind="haiku"]')).toContain(
      "var(--void-model-tier-2)",
    )
  })

  test("the neutral tag stays readable in light", () => {
    const rule = body(
      css,
      'html[data-theme="void"][data-color-scheme="light"] [data-slot="void-agent-tag"][data-kind="other"]',
    )
    expect(rule).toContain("var(--void-text-1)")
    expect(rule).toContain("border")
  })

  test("the dock sits in a footer row with the telemetry corners", () => {
    expect(body(overview, 'html[data-theme="void"] [data-slot="void-overview-foot"]')).toContain("var(--void-dock-w)")
    expect(overview).toContain('[data-slot="void-overview-tele"][data-side="right"]')
  })
})
