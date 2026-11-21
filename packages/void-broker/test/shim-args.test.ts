import { describe, expect, test } from "bun:test"
import { shimArgv } from "../src/acpx"
import { binaryArgs, parseShimArgs } from "../src/shim/args"
import type { WorkerEntry } from "../src/workers"

const worker = (extra: Partial<WorkerEntry> = {}): WorkerEntry => ({
  id: "w",
  backend: "anthropic-cli",
  mcp: [],
  deny: [],
  warm: false,
  description: "",
  ...extra,
})

describe("per-worker mcp deny", () => {
  test("shimArgv passes each deny rule to the shim", () => {
    const argv = shimArgv(worker({ deny: ["mcp__memory__forget", "mcp__files__*"] }))
    expect(argv.slice(2)).toEqual(["--deny", "mcp__memory__forget", "--deny", "mcp__files__*"])
  })

  test("shimArgv adds nothing without deny rules", () => {
    expect(shimArgv(worker()).slice(2)).toEqual([])
  })

  test("parseShimArgs collects the deny rules", () => {
    expect(parseShimArgs(["--deny", "mcp__a__b", "--deny", "mcp__c__*"]).deny).toEqual(["mcp__a__b", "mcp__c__*"])
    expect(parseShimArgs([]).deny).toEqual([])
  })

  test("binaryArgs passes one comma separated disallowed tools list", () => {
    const options = { ...parseShimArgs(["--deny", "mcp__a__b", "--deny", "mcp__c__*"]) }
    const args = binaryArgs(options, "/tmp/mcp.json", { id: "s", resume: false })
    expect(args[args.indexOf("--disallowed-tools") + 1]).toBe("mcp__a__b,mcp__c__*")
  })

  test("binaryArgs omits the flag without deny rules", () => {
    const args = binaryArgs(parseShimArgs([]), "/tmp/mcp.json", { id: "s", resume: false })
    expect(args).not.toContain("--disallowed-tools")
  })
})
