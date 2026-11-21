import { describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveMcp } from "../src/links"
import { readSpaceMcp } from "../src/space-mcp"
import { tempDir } from "./helpers"

const base = { memoryDb: "/d", memoryMain: "/m", workerId: "w" }

describe("resolveMcp with the space mcp block", () => {
  test("a stdio server from the space becomes an acp stdio server", () => {
    const servers = resolveMcp(["files"], {
      ...base,
      spaceMcp: { files: { type: "local", command: ["node", "s.js"], environment: { A: "1" } } },
    })
    expect(servers).toEqual([{ name: "files", command: "node", args: ["s.js"], env: [{ name: "A", value: "1" }] }])
  })

  test("a remote server from the space becomes an acp http server", () => {
    const servers = resolveMcp(["hub"], {
      ...base,
      spaceMcp: { hub: { type: "remote", url: "https://h/mcp", headers: { X: "y" } } },
    })
    expect(servers).toEqual([{ type: "http", name: "hub", url: "https://h/mcp", headers: [{ name: "X", value: "y" }] }])
  })

  test("memory keeps resolving next to space servers", () => {
    const servers = resolveMcp(["memory", "files"], { ...base, spaceMcp: { files: { type: "local", command: ["n"] } } })
    expect(servers.map((server) => server.name)).toEqual(["memory", "files"])
  })

  test("a space entry named memory does not replace the built-in one", () => {
    const [server] = resolveMcp(["memory"], { ...base, spaceMcp: { memory: { type: "local", command: ["evil"] } } })
    expect(server).toMatchObject({ command: process.execPath })
  })

  test("a disabled or secret entry is unknown", () => {
    const spaceMcp = {
      off: { type: "local", command: ["x"], enabled: false },
      sec: { type: "local", command: ["x"], environment: { K: "secret:k" } },
    }
    expect(() => resolveMcp(["off"], { ...base, spaceMcp })).toThrow("unknown mcp server: off")
    expect(() => resolveMcp(["sec"], { ...base, spaceMcp })).toThrow("unknown mcp server: sec")
  })
})

describe("readSpaceMcp", () => {
  test("reads the mcp block from opencode.jsonc with comments", async () => {
    const dir = await tempDir()
    await writeFile(
      path.join(dir, "opencode.jsonc"),
      '{\n  // servers\n  "mcp": { "files": { "type": "local", "command": ["n"], }, },\n}\n',
    )
    expect(readSpaceMcp(dir)).toEqual({ files: { type: "local", command: ["n"] } })
  })

  test("falls back to opencode.json", async () => {
    const dir = await tempDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "opencode.json"), JSON.stringify({ mcp: { a: { type: "local", command: ["n"] } } }))
    expect(readSpaceMcp(dir)).toEqual({ a: { type: "local", command: ["n"] } })
  })

  test("returns undefined for a missing directory, a missing file or invalid content", async () => {
    const dir = await tempDir()
    expect(readSpaceMcp(undefined)).toBeUndefined()
    expect(readSpaceMcp(path.join(dir, "none"))).toBeUndefined()
    expect(readSpaceMcp(dir)).toBeUndefined()
    await writeFile(path.join(dir, "opencode.jsonc"), "not json {")
    expect(readSpaceMcp(dir)).toBeUndefined()
  })
})
