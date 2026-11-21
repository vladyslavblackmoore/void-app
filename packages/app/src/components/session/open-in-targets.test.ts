import { describe, expect, test } from "bun:test"
import { changedPaths, openTargets } from "./open-in-targets"

describe("changedPaths", () => {
  test("joins relative files to the directory, keeps absolute ones and drops duplicates", () => {
    expect(changedPaths("/proj/", ["a.ts", "src/b.ts", "/abs/c.ts", "a.ts"])).toEqual([
      "/proj/a.ts",
      "/proj/src/b.ts",
      "/abs/c.ts",
    ])
  })
})

describe("openTargets", () => {
  const paths = ["/proj/a.ts", "/proj/b.ts"]

  test("editors receive every changed file", () => {
    expect(openTargets("vscode", "/proj", paths)).toEqual({ reveal: false, paths })
  })

  test("terminals receive the directory", () => {
    expect(openTargets("ghostty", "/proj", paths)).toEqual({ reveal: false, paths: ["/proj"] })
  })

  test("finder reveals the first file", () => {
    expect(openTargets("finder", "/proj", paths)).toEqual({ reveal: true, paths: ["/proj/a.ts"] })
  })

  test("without paths the directory is opened", () => {
    expect(openTargets("vscode", "/proj")).toEqual({ reveal: false, paths: ["/proj"] })
    expect(openTargets("finder", "/proj")).toEqual({ reveal: false, paths: ["/proj"] })
  })
})
