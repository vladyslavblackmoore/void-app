import { describe, expect, test } from "bun:test"
import { variantControlKind } from "./variant-control"

describe("variant control kind", () => {
  test("hides the control when there is nothing to choose", () => {
    expect(variantControlKind({ style: "segmented", count: 1 })).toBe("none")
    expect(variantControlKind({ style: "menu", count: 0 })).toBe("none")
  })

  test("renders the existing menu by default", () => {
    expect(variantControlKind({ style: undefined, count: 4 })).toBe("menu")
    expect(variantControlKind({ style: "menu", count: 4 })).toBe("menu")
  })

  test("renders a segmented control when requested", () => {
    expect(variantControlKind({ style: "segmented", count: 2 })).toBe("segmented")
  })
})
