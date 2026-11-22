import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { changedFilePaths, commonParent, openInDirectory, resolveChangedFiles } from "./changed-files"

const tool = (name: string, status: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) =>
  ({
    id: "p",
    sessionID: "s",
    messageID: "m",
    type: "tool",
    callID: "c",
    tool: name,
    state: { status, input, metadata },
  }) as unknown as Part

describe("changedFilePaths", () => {
  test("collects edit and write targets of completed calls without duplicates", () => {
    const parts = [
      tool("edit", "completed", { filePath: "/p/a.ts" }),
      tool("write", "completed", { filePath: "/p/b.ts" }),
      tool("edit", "completed", { filePath: "/p/a.ts" }),
    ]
    expect(changedFilePaths(parts)).toEqual(["/p/a.ts", "/p/b.ts"])
  })

  test("reads apply_patch files from metadata and prefers the moved path", () => {
    const parts = [
      tool(
        "apply_patch",
        "completed",
        {},
        { files: [{ filePath: "/p/a.ts" }, { filePath: "/p/b.ts", movePath: "/p/c.ts" }] },
      ),
    ]
    expect(changedFilePaths(parts)).toEqual(["/p/a.ts", "/p/c.ts"])
  })

  test("ignores read tools, unfinished calls and other part types", () => {
    const parts = [
      tool("read", "completed", { filePath: "/p/a.ts" }),
      tool("edit", "error", { filePath: "/p/b.ts" }),
      tool("write", "running", { filePath: "/p/c.ts" }),
      { id: "t", sessionID: "s", messageID: "m", type: "text", text: "hi" } as Part,
    ]
    expect(changedFilePaths(parts)).toEqual([])
  })
})

describe("resolveChangedFiles", () => {
  test("joins relative files to the session directory and drops duplicates", () => {
    expect(resolveChangedFiles(["a.ts", "/x/b.ts", "a.ts", "C:\\w\\c.ts"], "/s/")).toEqual([
      "/s/a.ts",
      "/x/b.ts",
      "C:\\w\\c.ts",
    ])
  })

  test("drops relative files when there is no session directory", () => {
    expect(resolveChangedFiles(["a.ts", "/x/b.ts"], "")).toEqual(["/x/b.ts"])
  })
})

describe("commonParent", () => {
  test("returns the deepest shared directory", () => {
    expect(commonParent(["/a/b/c.ts", "/a/b/d/e.ts"])).toBe("/a/b")
    expect(commonParent(["/a/b/c.ts"])).toBe("/a/b")
  })

  test("does not match on a shared name prefix", () => {
    expect(commonParent(["/a/bc/x.ts", "/a/bd/y.ts"])).toBe("/a")
  })

  test("falls back to the root and to nothing", () => {
    expect(commonParent(["/a/x.ts", "/b/y.ts"])).toBe("/")
    expect(commonParent([])).toBeUndefined()
  })
})

describe("openInDirectory", () => {
  const roots = (map: Record<string, string>) => async (directory: string) => map[directory] ?? null

  test("uses the git root of the first changed file", async () => {
    const result = await openInDirectory({
      files: ["/r1/src/a.ts", "/r2/b.ts"],
      directory: "/",
      gitRoot: roots({ "/r1/src": "/r1", "/r2": "/r2" }),
    })
    expect(result).toBe("/r1")
  })

  test("skips files outside a repository and takes the next repository", async () => {
    const result = await openInDirectory({
      files: ["/loose/a.ts", "/r2/b.ts"],
      directory: "/",
      gitRoot: roots({ "/r2": "/r2" }),
    })
    expect(result).toBe("/r2")
  })

  test("uses the common parent when no file is in a repository", async () => {
    const result = await openInDirectory({
      files: ["/w/a/x.ts", "/w/b/y.ts"],
      directory: "/",
      gitRoot: roots({}),
    })
    expect(result).toBe("/w")
  })

  test("resolves relative files against the session directory", async () => {
    const result = await openInDirectory({
      files: ["src/a.ts"],
      directory: "/s",
      gitRoot: roots({ "/s/src": "/s" }),
    })
    expect(result).toBe("/s")
  })

  test("falls back to the session directory without usable paths and survives lookup errors", async () => {
    expect(await openInDirectory({ files: ["a.ts"], directory: "", gitRoot: roots({}) })).toBe("")
    const failing = async () => {
      throw new Error("boom")
    }
    expect(await openInDirectory({ files: ["/w/a.ts"], directory: "/", gitRoot: failing })).toBe("/w")
  })
})
