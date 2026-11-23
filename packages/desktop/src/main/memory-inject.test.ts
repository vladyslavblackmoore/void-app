import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const resources = join(import.meta.dir, "../../resources")
const memory = await import(join(resources, "delegate/memory.mjs"))

describe("capMemory", () => {
  test("returns short text unchanged", () => {
    expect(memory.capMemory("a\nb\n", 100, "/m/MEMORY.md")).toBe("a\nb")
  })

  test("cuts at a line boundary and marks the file", () => {
    const text = ["one", "two", "three"].join("\n")

    expect(memory.capMemory(text, 9, "/m/MEMORY.md")).toBe("one\ntwo\n[truncated: read the full file at /m/MEMORY.md]")
  })

  test("cuts a single long line at the limit", () => {
    expect(memory.capMemory("x".repeat(50), 10, "/p")).toBe(`${"x".repeat(10)}\n[truncated: read the full file at /p]`)
  })
})

describe("tasksDigest", () => {
  const done = Array.from({ length: 8 }, (_, index) => `- [ses_${index}] task ${index}`)
  const text = ["# Tasks", "", "## Open", "- [ses_a] open one", "- [ses_b] open two", "", "## Done", ...done].join("\n")

  test("keeps the whole Open section and the last five Done items", () => {
    const result = memory.tasksDigest(text)

    expect(result).toContain("- [ses_a] open one")
    expect(result).toContain("- [ses_b] open two")
    expect(result).not.toContain("task 2")
    expect(result).toContain("task 3")
    expect(result).toContain("task 7")
    expect(result).toContain("(3 older done items omitted)")
  })

  test("keeps every Done item when there are few", () => {
    expect(memory.tasksDigest("## Open\n\n## Done\n- a\n- b")).toBe("## Open\n\n## Done\n- a\n- b")
  })

  test("returns a file without a Done section as is", () => {
    expect(memory.tasksDigest("## Open\n- x\n")).toBe("## Open\n- x")
  })
})

describe("closeStopped", () => {
  const text = "# Tasks\n\n## Open\n- [ses_a] first\n- [ses_b] second\n- [ses_a] third\n\n## Done\n- [ses_c] old\n"

  test("moves the entries of the session to Done marked stopped", () => {
    expect(memory.closeStopped(text, "ses_a")).toBe(
      "# Tasks\n\n## Open\n- [ses_b] second\n\n## Done\n- [ses_c] old\n- [ses_a] first (stopped)\n- [ses_a] third (stopped)\n",
    )
  })

  test("leaves the text alone when the session has no Open entries", () => {
    expect(memory.closeStopped(text, "ses_z")).toBe(text)
  })

  test("creates a Done section when it is missing", () => {
    expect(memory.closeStopped("## Open\n- [ses_a] first\n", "ses_a")).toBe(
      "## Open\n\n\n## Done\n- [ses_a] first (stopped)",
    )
  })
})

describe("memoryBlock", () => {
  const files = { index: "idx", rules: "rls", tasks: "## Open\n- t\n\n## Done\n- d" }

  test("gives the manager tasks and children only the index and rules", () => {
    const top = memory.memoryBlock(files, "/m", true)
    const child = memory.memoryBlock(files, "/m", false)

    expect(top).toContain("idx")
    expect(top).toContain("- t")
    expect(child).toContain("rls")
    expect(child).not.toContain("- t")
  })

  test("skips empty files", () => {
    expect(memory.memoryBlock({ index: "", rules: "", tasks: "" }, "/m", true)).toBe("")
  })
})

type Hooks = {
  "experimental.chat.system.transform": (
    hook: { sessionID?: string; small?: boolean; agent?: string },
    output: { system: string[] },
  ) => Promise<void>
  event: (input: { event: { type: string; properties: unknown } }) => Promise<void>
}

const parents: Record<string, string | undefined> = { ses_top: undefined, ses_kid: "ses_top", ses_deep: "ses_kid" }

let root = ""
let memDir = ""
let server: ReturnType<typeof Bun.serve>
let hooks: Hooks

const tasks = "# Tasks\n\n## Open\n- [ses_top] ship it\n\n## Done\n"

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-inject-"))
  memDir = join(root, "memory")
  await mkdir(memDir)
  await writeFile(join(memDir, "MEMORY.md"), "index line")
  await writeFile(join(memDir, "RULES.md"), "rule line")
  await writeFile(join(memDir, "tasks.md"), tasks)
  await mkdir(join(root, "plugins"))
  await mkdir(join(root, "delegate"))
  await cp(join(resources, "plugin/delegate.js"), join(root, "plugins/delegate.js"))
  for (const name of ["core.mjs", "mcp.mjs", "memory.mjs", "manager.md"])
    await cp(join(resources, "delegate", name), join(root, "delegate", name))
  await writeFile(join(root, "delegate/paths.json"), JSON.stringify({ memoryDir: memDir }))
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const id = new URL(request.url).pathname.match(/^\/session\/(ses_[a-z]+)$/)?.[1]
      return id && id in parents
        ? Response.json({ id, parentID: parents[id] })
        : new Response("missing", { status: 404 })
    },
  })
  const plugin = (await import(join(root, "plugins/delegate.js"))).default as {
    server: (input: { serverUrl: URL; directory: string }) => Promise<Hooks>
  }
  hooks = await plugin.server({ serverUrl: server.url, directory: "/work" })
})

afterEach(async () => {
  server.stop(true)
  await rm(root, { recursive: true, force: true })
})

const transform = async (sessionID?: string, extra: { small?: boolean; agent?: string } = {}) => {
  const output = { system: ["base prompt"] }
  await hooks["experimental.chat.system.transform"]({ sessionID, ...extra }, output)
  return output.system
}

describe("system transform", () => {
  test("gives the top-level session the manager rules, its id and the memory with tasks", async () => {
    const system = await transform("ses_top")

    expect(system).toHaveLength(1)
    expect(system[0]).toStartWith("base prompt")
    expect(system[0]).toContain("Manager rules")
    expect(system[0]).toContain("Your session id: ses_top")
    expect(system[0]).toContain("index line")
    expect(system[0]).toContain("rule line")
    expect(system[0]).toContain("ship it")
  })

  test("gives a child the worker note and read-only memory without manager rules or tasks", async () => {
    const [text] = await transform("ses_kid")

    expect(text).not.toContain("[delegated worker]")
    expect(text).toContain("child session")
    expect(text).toContain("never say you will report later")
    expect(text).toContain("index line")
    expect(text).not.toContain("Manager rules")
    expect(text).not.toContain("ship it")
  })

  test("tells a depth-two child not to delegate", async () => {
    expect((await transform("ses_deep"))[0]).toContain("Do not use delegate.")
  })

  test("leaves the prompt alone without a session id or when the session lookup fails", async () => {
    expect(await transform(undefined)).toEqual(["base prompt"])
    expect(await transform("ses_unknown")).toEqual(["base prompt"])
  })

  test("skips small calls and compaction", async () => {
    expect(await transform("ses_top", { small: true })).toEqual(["base prompt"])
    expect(await transform("ses_kid", { agent: "compaction" })).toEqual(["base prompt"])
  })

  test("injects nothing from memory when the memory path is unknown", async () => {
    await rm(join(root, "delegate/paths.json"))

    const [text] = await transform("ses_top")

    expect(text).toContain("Manager rules")
    expect(text).not.toContain("index line")
  })
})

describe("abort event", () => {
  const abort = (sessionID: string, name = "MessageAbortedError") =>
    hooks.event({ event: { type: "session.error", properties: { sessionID, error: { name } } } })
  const tasksFile = () => readFile(join(memDir, "tasks.md"), "utf8")

  test("moves the Open entries of an aborted top-level session to Done as stopped", async () => {
    await abort("ses_top")

    expect(await tasksFile()).toBe("# Tasks\n\n## Open\n\n## Done\n- [ses_top] ship it (stopped)\n")
  })

  test("ignores other errors and child sessions", async () => {
    await abort("ses_top", "UnknownError")
    await abort("ses_kid")

    expect(await tasksFile()).toBe(tasks)
  })

  test("ignores other events", async () => {
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_top" } } })

    expect(await tasksFile()).toBe(tasks)
  })
})
