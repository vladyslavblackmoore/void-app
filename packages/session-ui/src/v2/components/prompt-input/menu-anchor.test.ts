import { describe, expect, test } from "bun:test"
import { dockAnchorRect } from "./menu-anchor"

function box(top: number, left = 0, width = 0) {
  return { getBoundingClientRect: () => ({ top, left, width }) }
}

describe("dockAnchorRect", () => {
  test("returns undefined without an anchor", () => {
    expect(dockAnchorRect(undefined)).toBeUndefined()
  })

  test("aligns to the trigger's left edge and width at the dock's top edge", () => {
    const anchor = { ...box(500, 120, 78), closest: () => box(420) } as unknown as HTMLElement
    expect(dockAnchorRect(anchor)).toEqual({ x: 120, y: 420, width: 78, height: 0 })
  })

  test("falls back to the trigger's top outside a dock", () => {
    const anchor = { ...box(500, 10, 40), closest: () => null } as unknown as HTMLElement
    expect(dockAnchorRect(anchor)).toEqual({ x: 10, y: 500, width: 40, height: 0 })
  })
})
