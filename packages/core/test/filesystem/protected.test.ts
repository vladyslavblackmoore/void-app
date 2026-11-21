import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { Protected } from "@opencode-ai/core/filesystem/protected"

const home = os.homedir()

describe("Protected.inside", () => {
  test.if(process.platform === "darwin")("lists the protected home folders relative to home", () => {
    const inside = Protected.inside(home)
    expect(inside).toContain("Desktop")
    expect(inside).toContain("Documents")
    expect(inside).toContain("Downloads")
    expect(inside).toContain("Library")
  })

  test("lists nothing for a project dir outside the protected folders", () => {
    expect(Protected.inside(path.join(home, "code", "project"))).toEqual([])
  })

  test("lists nothing for a project inside a protected folder", () => {
    expect(Protected.inside(path.join(home, "Desktop", "project"))).toEqual([])
  })
})
