import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readViewedSpace, spaceStatePath, writeViewedSpace } from "./space-state"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-space-state-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("space state", () => {
  test("lives under the state folder of the root", () => {
    expect(spaceStatePath(root)).toBe(join(root, "state", "spaces.json"))
  })

  test("reads nothing when the file is absent", async () => {
    expect(await readViewedSpace(root)).toBeUndefined()
  })

  test("writes and reads the viewed space with private modes", async () => {
    await writeViewedSpace(root, "void")
    expect(await readViewedSpace(root)).toBe("void")
    expect(((await stat(spaceStatePath(root))).mode & 0o777).toString(8)).toBe("600")
    expect(((await stat(join(root, "state"))).mode & 0o777).toString(8)).toBe("700")
  })

  test("keeps the other fields of the file", async () => {
    await mkdir(join(root, "state"), { recursive: true })
    await writeFile(spaceStatePath(root), JSON.stringify({ viewed: "home", order: ["void", "home"] }))
    await writeViewedSpace(root, "work")
    const saved = JSON.parse(await readFile(spaceStatePath(root), "utf8"))
    expect(saved).toEqual({ viewed: "work", order: ["void", "home"] })
  })

  test("ignores a damaged file and an invalid id", async () => {
    await mkdir(join(root, "state"), { recursive: true })
    await writeFile(spaceStatePath(root), "{")
    expect(await readViewedSpace(root)).toBeUndefined()
    await writeFile(spaceStatePath(root), JSON.stringify({ viewed: "../x" }))
    expect(await readViewedSpace(root)).toBeUndefined()
    await writeViewedSpace(root, "void")
    expect(await readViewedSpace(root)).toBe("void")
  })

  test("refuses to write an invalid id", async () => {
    await expect(writeViewedSpace(root, "../x")).rejects.toThrow()
    expect(await readViewedSpace(root)).toBeUndefined()
  })
})
