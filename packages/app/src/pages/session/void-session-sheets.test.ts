import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const body = (css: string, selector: string) => {
  const index = css.indexOf(selector + " {")
  return index < 0 ? "" : css.slice(index, css.indexOf("}", index))
}

describe("void session sheets", () => {
  const css = read("./void-session-sheets.css")
  const empty = read("./void-sessions-empty.tsx")
  const card = read("./void-space-card.tsx")
  const list = read("./void-session-list.tsx")
  const sel = (slot: string) => `html[data-theme="void"] [data-slot="${slot}"]`

  test("the search field and its placeholder are 13px at muted contrast", () => {
    expect(body(css, sel("void-sheet-search"))).toContain("font-size: 13px")
    const placeholder = body(css, sel("void-sheet-search") + "::placeholder")
    expect(placeholder).toContain("font-size: 13px")
    expect(placeholder).toContain("color: var(--void-text-2)")
  })

  test("the empty state has an icon, a title, a text and an optional action", () => {
    for (const slot of ["void-empty-icon", "void-empty-title", "void-empty-text", "void-empty-action"]) {
      expect(empty).toContain(`data-slot="${slot}"`)
      expect(css).toContain(sel(slot))
    }
    expect(list).toContain("VoidSessionsEmpty")
    expect(list).not.toContain("void.sessions.empty\"")
  })

  test("the space card shows the label, the name and the core state", () => {
    for (const slot of ["void-space-card-label", "void-space-card-dot", "void-space-card-name", "void-space-card-core"]) {
      expect(card).toContain(`data-slot="${slot}"`)
    }
    expect(card).toContain("void.space.label")
    expect(card).toContain("void.space.status.")
    expect(card).toContain("spaceCardModel")
    expect(list).toContain("<VoidSpaceCard />")
    expect(body(css, sel("void-space-card") + '[data-core="running"] ' + '[data-slot="void-space-card-core"]')).toContain(
      "var(--void-green)",
    )
  })
})
