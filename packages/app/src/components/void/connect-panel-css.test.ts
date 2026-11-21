import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const body = (css: string, selector: string) => {
  const index = css.indexOf(selector + " {")
  return index < 0 ? "" : css.slice(index, css.indexOf("}", index))
}

describe("connect panel and hub styles", () => {
  const panel = read("./connect-panel.css")
  const hub = read("./hub.css")

  test("fades the disabled primary through opacity and keeps Back readable", () => {
    expect(body(panel, '[data-component="void-connect-panel"] [data-slot="void-panel-next"]:disabled')).toContain(
      "opacity: 0.6",
    )
    expect(body(panel, '[data-component="void-connect-panel"] [data-slot="void-panel-back"]:disabled')).toContain(
      "opacity: 0.6",
    )
    expect(body(panel, '[data-component="void-connect-panel"] [data-slot="void-panel-back"]')).toContain(
      "border-color: var(--void-border-strong",
    )
  })

  test("sizes the panel to its content without a spacer", () => {
    expect(body(panel, '[data-component="void-connect-panel"]')).toContain("align-self: flex-start")
    expect(panel).not.toContain("void-panel-spacer")
  })

  test("does not stretch tiles to the tallest tile in a row", () => {
    expect(body(hub, '[data-component="void-hub"] [data-slot="void-hub-grid"]')).toContain("align-items: start")
  })
})
