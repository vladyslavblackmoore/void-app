import { beforeEach, describe, expect, test } from "bun:test"

const src = await Bun.file(new URL("../public/oc-theme-preload.js", import.meta.url)).text()

const run = () => Function(src)()

const prefer = (scheme: "dark" | "light" | null) => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({ matches: scheme !== null && query.includes(scheme) }) as MediaQueryList,
    configurable: true,
  })
}

beforeEach(() => {
  document.head.innerHTML = ""
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-color-scheme")
  localStorage.clear()
  prefer(null)
})

describe("theme preload", () => {
  test("migrates legacy oc-1 to oc-2 before mount", () => {
    prefer("light")
    localStorage.setItem("opencode-theme-id", "oc-1")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#fff;")
    localStorage.setItem("opencode-theme-css-dark", "--background-base:#000;")

    run()

    expect(document.documentElement.dataset.theme).toBe("oc-2")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(localStorage.getItem("opencode-theme-id")).toBe("oc-2")
    expect(localStorage.getItem("opencode-theme-css-light")).toBeNull()
    expect(localStorage.getItem("opencode-theme-css-dark")).toBeNull()
    expect(document.getElementById("oc-theme-preload")).toBeNull()
  })

  test("defaults to void with the void canvas when nothing is stored", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'
    prefer("dark")

    run()

    expect(document.documentElement.dataset.theme).toBe("void")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#0c0d0f")
  })

  test("defaults to dark when the system states no preference", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'

    run()

    expect(document.documentElement.dataset.theme).toBe("void")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#0c0d0f")
  })

  test("defaults to the void light canvas when the system prefers light", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'
    prefer("light")

    run()

    expect(document.documentElement.dataset.theme).toBe("void")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#eceef1")
  })

  test("applies cached void css when nothing is stored but the cache exists", () => {
    prefer("light")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#eceef1;")

    run()

    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:#eceef1;")
  })

  test("keeps an explicitly stored oc-2 without cached css", () => {
    prefer("light")
    localStorage.setItem("opencode-theme-id", "oc-2")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#fff;")

    run()

    expect(document.documentElement.dataset.theme).toBe("oc-2")
    expect(document.getElementById("oc-theme-preload")).toBeNull()
  })

  test("keeps cached css for non-default themes", () => {
    prefer("light")
    localStorage.setItem("opencode-theme-id", "nightowl")
    localStorage.setItem("opencode-theme-css-light", "--background-base:#fff;")

    run()

    expect(document.documentElement.dataset.theme).toBe("nightowl")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:#fff;")
  })

  test("paints the void canvas on the root and the theme-color meta in dark mode", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'
    localStorage.setItem("opencode-theme-id", "void")
    localStorage.setItem("opencode-color-scheme", "dark")

    run()

    expect(document.documentElement.dataset.theme).toBe("void")
    expect(document.documentElement.style.backgroundColor).toMatch(/^(#0c0d0f|rgb\(12, 13, 15\))$/)
    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#0c0d0f")
  })

  test("paints the void light canvas for the light scheme", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'
    localStorage.setItem("opencode-theme-id", "void")
    localStorage.setItem("opencode-color-scheme", "light")

    run()

    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#eceef1")
  })

  test("keeps the shared dark canvas for other themes", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa">'
    localStorage.setItem("opencode-theme-id", "nightowl")
    localStorage.setItem("opencode-color-scheme", "dark")

    run()

    expect(document.querySelector("meta[name='theme-color']")?.getAttribute("content")).toBe("#080808")
  })
})
