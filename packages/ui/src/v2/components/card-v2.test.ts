import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const dir = new URL("./", import.meta.url)
const read = (name: string) => readFileSync(new URL(name, dir), "utf8")

describe("card v2", () => {
  test("ships a component, a stylesheet and a story", () => {
    for (const name of ["card-v2.tsx", "card-v2.css", "card-v2.stories.tsx"]) {
      expect(existsSync(new URL(name, dir))).toBe(true)
    }
  })

  test("styles every surface and the eyebrow label", () => {
    const css = read("card-v2.css")
    expect(css).toContain('[data-component="card-v2"]')
    for (const surface of ["glass", "inner"]) {
      expect(css).toContain(`[data-surface="${surface}"]`)
    }
    expect(css).toContain('[data-slot="card-v2-eyebrow"]')
    expect(css).toContain("blur(var(--void-blur")
  })

  test("exposes the surface and the eyebrow through data attributes", () => {
    const source = read("card-v2.tsx")
    expect(source).toContain('data-component="card-v2"')
    expect(source).toContain("data-surface")
    expect(source).toContain('data-slot="card-v2-eyebrow"')
  })

  test("is served by the v2 export patterns", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", dir), "utf8"))
    expect(pkg.exports["./v2/*"]).toBe("./src/v2/components/*.tsx")
    expect(pkg.exports["./v2/*.css"]).toBe("./src/v2/components/*.css")
  })
})
