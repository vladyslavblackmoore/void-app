import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { join } from "node:path"

type Seen = { method: string; path: string; search: string; auth: string | null; body: any }
type Hooks = {
  tool: {
    delegate: {
      description: string
      args: Record<string, unknown>
      execute: (
        args: { task: string; model: string; agent: string },
        ctx: { sessionID: string; directory: string; abort: AbortSignal },
      ) => Promise<{ title: string; output: string; metadata: { sessionId: string; unconfirmed: boolean } }>
    }
  }
  "chat.headers": (
    hook: { model: { providerID: string } },
    output: { headers: Record<string, string> },
  ) => Promise<void>
}

const resources = join(import.meta.dir, "../../resources")
const core = await import(join(resources, "delegate/core.mjs"))
const plugin = (await import(join(resources, "plugin/delegate.js"))).default as {
  server: (input: { serverUrl: URL; directory: string }) => Promise<Hooks>
}

let seen: Seen[] = []
let server: ReturnType<typeof Bun.serve>
let release: (() => void) | undefined
let hold = false
let config: unknown = {}
let childParts: unknown[] | undefined
let promptFails = false
let childMessages: unknown[] = []

const parents: Record<string, string | undefined> = {
  ses_parent: undefined,
  ses_d1: "ses_parent",
  ses_d2: "ses_d1",
}

const parentMessages = [
  { info: { id: "m1", role: "user", time: { created: 1 }, model: { providerID: "old", modelID: "user" } }, parts: [] },
  { info: { id: "m2", role: "assistant", time: { created: 5 }, providerID: "openai", modelID: "gpt-5" }, parts: [] },
  {
    info: { id: "m3", role: "assistant", time: { created: 3 }, providerID: "github-copilot", modelID: "x" },
    parts: [],
  },
]

beforeEach(() => {
  seen = []
  hold = false
  config = {}
  childParts = undefined
  promptFails = false
  childMessages = []
  release = undefined
  process.env.OPENCODE_SERVER_PASSWORD = "secret"
  delete process.env.OPENCODE_SERVER_USERNAME
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const text = await request.text()
      seen.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        auth: request.headers.get("authorization"),
        body: text ? JSON.parse(text) : undefined,
      })
      const known = url.pathname.match(/^\/session\/(ses_[a-z0-9]+)$/)?.[1]
      if (request.method === "GET" && known && known in parents)
        return Response.json({ id: known, parentID: parents[known] })
      if (request.method === "POST" && url.pathname === "/session") return Response.json({ id: "ses_child" })
      if (request.method === "GET" && url.pathname === "/config") return Response.json(config)
      if (url.pathname.endsWith("/abort")) {
        release?.()
        return Response.json(true)
      }
      if (request.method === "GET" && url.pathname === "/session/ses_parent/message")
        return Response.json(parentMessages)
      if (request.method === "DELETE" && url.pathname === "/session/ses_child") return Response.json(true)
      if (request.method === "GET" && url.pathname === "/session/ses_child/message") return Response.json(childMessages)
      if (url.pathname === "/session/ses_child/message") {
        if (promptFails) return new Response("Model not found: a/b", { status: 500 })
        if (hold) await new Promise<void>((resolve) => (release = resolve))
        return Response.json({
          info: { id: "m9", role: "assistant" },
          parts: childParts ?? [
            { type: "text", text: "first" },
            { type: "text", text: "hidden", synthetic: true },
            { type: "tool", tool: "read" },
            { type: "text", text: "second" },
          ],
        })
      }
      return new Response("missing", { status: 404 })
    },
  })
})

afterEach(() => {
  server.stop(true)
})

const base = () => ({ url: server.url.href, username: "opencode", password: "secret", directory: "/work/project" })
const bodyOf = (method: string, path: string) => seen.find((item) => item.method === method && item.path === path)?.body

describe("delegate core", () => {
  test("creates a child with the parent id and allow-all permissions, prompts it and returns text and id", async () => {
    const result = await core.runDelegate(core.createApi(base()), {
      task: "do it",
      model: "openai/gpt-5-mini",
      agent: "explore",
      parentID: "ses_parent",
    })

    expect(result).toEqual({ id: "ses_child", text: "first\nsecond", error: undefined })
    expect(bodyOf("POST", "/session")).toEqual({
      parentID: "ses_parent",
      title: "do it",
      permission: [
        { permission: "*", pattern: "*", action: "allow" },
        { permission: "question", pattern: "*", action: "deny" },
      ],
    })
    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5-mini" },
      agent: "explore",
      parts: [{ type: "text", text: core.workerNote(1) + "do it" }],
    })
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`)
    expect(seen[0]!.search).toBe("?directory=%2Fwork%2Fproject")
    expect(core.formatResult(result)).toBe("first\nsecond\n\nsession: ses_child")
  })

  test("flags a child that ended with a background shell command or a promise of later work", async () => {
    const run = () => core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_parent" })
    childParts = [
      { type: "tool", tool: "bash", state: { status: "completed", input: { command: "sleep 150 &" } } },
      { type: "text", text: "Started it." },
    ]
    expect((await run()).unfinished).toContain("background")
    childParts = [
      { type: "tool", tool: "Bash", state: { status: "completed", input: { command: "make", run_in_background: true } } },
      { type: "text", text: "Done." },
    ]
    expect((await run()).unfinished).toContain("background")
    childParts = [{ type: "tool", tool: "bash", state: { status: "running", input: { command: "make" } } }]
    expect((await run()).unfinished).toContain("running")
    childParts = [{ type: "text", text: "I will report once the sleep finishes." }]
    expect((await run()).unfinished).toContain("promise")
    childParts = [{ type: "text", text: "Сообщу, когда сборка закончится." }]
    expect((await run()).unfinished).toContain("promise")
    childParts = [{ type: "text", text: "Once it finishes, I'll write the essay." }]
    expect((await run()).unfinished).toContain("promise")
    childParts = [{ type: "text", text: "Отпишусь позже." }]
    expect((await run()).unfinished).toContain("promise")
    for (const text of [
      "This will update the cache when X changes.",
      "The script will write the output to out.txt.",
      "После завершения сборки тесты прошли.",
    ]) {
      childParts = [{ type: "text", text }]
      expect((await run()).unfinished).toBeUndefined()
    }
    for (const command of ["a &\nb &\nwait", "a && b", "nohup a &\nwait"]) {
      childParts = [{ type: "tool", tool: "bash", state: { status: "completed", input: { command } } }]
      expect((await run()).unfinished).toBeUndefined()
    }
    childParts = [
      { type: "tool", tool: "bash", state: { status: "completed", input: { command: "wait\na &" } } },
    ]
    expect((await run()).unfinished).toContain("background")
    childParts = [
      { type: "tool", tool: "bash", state: { status: "completed", input: { command: "sleep 1 && echo a" } } },
      { type: "text", text: "All finished: a" },
    ]
    expect((await run()).unfinished).toBeUndefined()
  })

  test("flags a background launch with a mid-line ampersand and sees tool parts of earlier steps", async () => {
    const command =
      "nohup sh -c 'sleep 150; echo done > /tmp/f2.txt' >/dev/null 2>&1 & launch_pid=$!; ps -p \"$launch_pid\""
    childMessages = [
      {
        info: { id: "m1", role: "assistant" },
        parts: [{ type: "tool", tool: "bash", state: { status: "completed", input: { command } } }],
      },
      { info: { id: "m2", role: "assistant" }, parts: [{ type: "text", text: "Launched." }] },
    ]
    childParts = [{ type: "text", text: "Launched." }]
    const result = await core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_parent" })
    expect(result.unfinished).toContain("background")
    childMessages = []
    for (const command of ["a 2>&1 | b", "a >&2", "a &> out", "a && b"]) {
      childParts = [{ type: "tool", tool: "bash", state: { status: "completed", input: { command } } }]
      const done = await core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_parent" })
      expect(done.unfinished).toBeUndefined()
    }
  })

  test("formatResult leads with a structured UNCONFIRMED status for an unfinished child", () => {
    const text = core.formatResult({ id: "ses_child", text: "Started.", unfinished: "a promise of later work" })
    expect(text.split("\n")[0]).toBe("STATUS: UNCONFIRMED - a promise of later work")
    expect(text).toContain("not confirmed")
    expect(text).toContain("nobody will report it later")
    expect(text).toContain("stays Open")
    expect(text).toContain("Started.")
    expect(text.endsWith("session: ses_child")).toBe(true)
    expect(core.formatResult({ id: "ses_child", text: "ok" })).toBe("ok\n\nsession: ses_child")
  })

  test("formatResult caps long child text and names the session to read more", () => {
    const text = core.formatResult({ id: "ses_child", text: "x".repeat(50000) })
    expect(text.length).toBeLessThan(21000)
    expect(text).toContain("truncated")
    expect(text).toContain("ses_child")
    expect(text.endsWith("session: ses_child")).toBe(true)
  })

  test("a trailing ampersand in a quote, a URL or before wait is not a background launch", async () => {
    const run = () => core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_parent" })
    for (const command of ["curl 'https://x.test/a?b=1&c=2'", 'echo "a & b"', "git log --grep='a & b'", "a & wait"]) {
      childParts = [{ type: "tool", tool: "bash", state: { status: "completed", input: { command } } }]
      expect((await run()).unfinished).toBeUndefined()
    }
    childParts = [{ type: "tool", tool: "bash", state: { status: "completed", input: { command: "sleep 9 &" } } }]
    expect((await run()).unfinished).toContain("background")
  })

  test("tells the child to finish everything in one turn", () => {
    const note = core.workerNote(1)
    expect(note).toContain("finish all work in this turn")
    expect(note).toContain("background")
    expect(note).toContain("report later")
  })

  test("titles the child with the first task line, trimmed to 60 characters", async () => {
    await core.runDelegate(core.createApi(base()), {
      task: `  ${"x".repeat(80)}\nsecond`,
      model: "a/b",
      parentID: "ses_parent",
    })
    expect(bodyOf("POST", "/session").title).toBe("x".repeat(60))
  })

  test("deletes the child session when the prompt fails before the child produced anything", async () => {
    promptFails = true
    await expect(
      core.runDelegate(core.createApi(base()), { task: "t", model: "", parentID: "ses_parent" }),
    ).rejects.toThrow("Model not found")
    expect(seen.some((item) => item.method === "DELETE" && item.path === "/session/ses_child")).toBe(true)
  })

  test("reports an unavailable model without the raw server error when an explicit model fails before any reply", async () => {
    promptFails = true
    const failure = await core
      .runDelegate(core.createApi(base()), { task: "t", model: "openai/no-such-model", parentID: "ses_parent" })
      .catch((error: Error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      "Model openai/no-such-model is not available. Leave model empty to use the default for children, or choose another model.",
    )
  })

  test("keeps the child session when the prompt fails after the child already answered", async () => {
    promptFails = true
    childMessages = [{ info: { id: "m1", role: "assistant" }, parts: [] }]
    await expect(
      core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_parent" }),
    ).rejects.toThrow()
    expect(seen.some((item) => item.method === "DELETE")).toBe(false)
  })

  test("defaults the model to the newest assistant message of the parent and omits an empty agent", async () => {
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("uses the worker default from the config when no model is passed", async () => {
    config = { agent: { worker: { model: "subscription/sonnet", variant: "high" } } }
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "subscription", modelID: "sonnet" },
      variant: "high",
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("uses the config model of the requested agent before the worker default", async () => {
    config = { agent: { worker: { model: "subscription/sonnet" }, explore: { model: "openai/gpt-5.6-sol" } } }
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "explore", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5.6-sol" },
      agent: "explore",
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("falls back to the worker default when the requested agent has no configured model", async () => {
    config = { agent: { worker: { model: "subscription/haiku", variant: "low" }, explore: {} } }
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "explore", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "subscription", modelID: "haiku" },
      variant: "low",
      agent: "explore",
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("lets an explicit model win over the config default and drops its variant", async () => {
    config = { agent: { worker: { model: "subscription/sonnet", variant: "high" } } }
    await core.runDelegate(core.createApi(base()), {
      task: "t",
      model: "openai/gpt-5-mini",
      agent: "",
      parentID: "ses_parent",
    })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5-mini" },
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("falls back to the parent model when the config has no usable default", async () => {
    config = { agent: { worker: { model: "broken", variant: "" } } }
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [{ type: "text", text: core.workerNote(1) + "t" }],
    })
  })

  test("resolves the child default from a config object", () => {
    expect(core.childDefault({ agent: { worker: { model: "a/b", variant: "low" } } }, undefined)).toEqual({
      model: { providerID: "a", modelID: "b" },
      variant: "low",
    })
    expect(core.childDefault({ agent: { worker: { model: "a/b", variant: "" } } }, undefined)).toEqual({
      model: { providerID: "a", modelID: "b" },
    })
    expect(core.childDefault({ agent: { worker: { model: "a/b" } } }, "explore")).toEqual({
      model: { providerID: "a", modelID: "b" },
    })
    expect(core.childDefault({ agent: {} }, undefined)).toBeUndefined()
    expect(core.childDefault(undefined, "x")).toBeUndefined()
  })

  test("tells a child at the depth limit not to delegate and a shallower child that it may", () => {
    expect(core.workerNote(1)).toContain("[delegated worker]")
    expect(core.workerNote(1)).toContain("only if")
    expect(core.workerNote(core.maxDepth)).toContain("[delegated worker]")
    expect(core.workerNote(core.maxDepth)).toContain("Do not use delegate")
  })

  test("counts parent hops up to the root and lets depth 0 and 1 delegate", async () => {
    expect(core.maxDepth).toBe(2)
    expect(await core.sessionDepth(core.createApi(base()), "ses_parent")).toBe(0)
    expect(await core.sessionDepth(core.createApi(base()), "ses_d1")).toBe(1)
    expect(await core.sessionDepth(core.createApi(base()), "ses_d2")).toBe(2)

    await core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_d1" })

    expect(bodyOf("POST", "/session")?.parentID).toBe("ses_d1")
    expect(bodyOf("POST", "/session/ses_child/message").parts[0].text).toContain("Do not use delegate")
  })

  test("refuses at depth 2 without creating a session", async () => {
    await expect(
      core.runDelegate(core.createApi(base()), { task: "t", model: "a/b", parentID: "ses_d2" }),
    ).rejects.toThrow("depth limit")
    expect(seen.some((item) => item.method === "POST")).toBe(false)
  })

  test("rejects a model that is not provider/model before creating a session", async () => {
    await expect(
      core.runDelegate(core.createApi(base()), { task: "t", model: "gpt-5", parentID: "ses_parent" }),
    ).rejects.toThrow("provider/model")
    expect(seen).toEqual([])
  })

  test("aborts the child when the signal fires", async () => {
    hold = true
    const controller = new AbortController()
    const run = core.runDelegate(
      core.createApi(base()),
      { task: "t", model: "a/b", parentID: "ses_parent" },
      controller.signal,
    )
    await Bun.sleep(100)
    controller.abort()

    expect((await run).id).toBe("ses_child")
    expect(seen.some((item) => item.method === "POST" && item.path === "/session/ses_child/abort")).toBe(true)
  })
})

describe("delegate plugin", () => {
  test("registers the tool and runs it against the child session", async () => {
    const hooks = await plugin.server({ serverUrl: server.url, directory: "/work/project" })
    const output = await hooks.tool.delegate.execute(
      { task: "do it", model: "a/b", agent: "" },
      { sessionID: "ses_parent", directory: "/work/project", abort: new AbortController().signal },
    )

    expect(output.output).toBe("first\nsecond\n\nsession: ses_child")
    expect(output.metadata).toEqual({ sessionId: "ses_child", unconfirmed: false })
    expect(bodyOf("POST", "/session")?.parentID).toBe("ses_parent")
    expect(Object.keys(hooks.tool.delegate.args)).toEqual(["task", "model", "agent"])
  })

  test("fails the tool at depth 2 and creates no session", async () => {
    const hooks = await plugin.server({ serverUrl: server.url, directory: "/work/project" })
    const run = hooks.tool.delegate.execute(
      { task: "do it", model: "a/b", agent: "" },
      { sessionID: "ses_d2", directory: "/work/project", abort: new AbortController().signal },
    )

    await expect(run).rejects.toThrow("depth limit")
    expect(seen.some((item) => item.method === "POST")).toBe(false)
  })

  test("aborts the child through the tool context", async () => {
    hold = true
    const hooks = await plugin.server({ serverUrl: server.url, directory: "/work/project" })
    const controller = new AbortController()
    const run = hooks.tool.delegate.execute(
      { task: "t", model: "a/b", agent: "" },
      { sessionID: "ses_parent", directory: "/work/project", abort: controller.signal },
    )
    await Bun.sleep(100)
    controller.abort()
    await run

    expect(seen.some((item) => item.path === "/session/ses_child/abort")).toBe(true)
  })

  test("adds the delegate headers for the subscription provider only", async () => {
    const hooks = await plugin.server({ serverUrl: server.url, directory: "/work/my project" })
    const subscription = { headers: {} as Record<string, string> }
    const other = { headers: {} as Record<string, string> }
    await hooks["chat.headers"]({ model: { providerID: "subscription" } }, subscription)
    await hooks["chat.headers"]({ model: { providerID: "openai" } }, other)

    expect(subscription.headers).toEqual({
      "x-void-delegate-url": server.url.href,
      "x-void-delegate-directory": "%2Fwork%2Fmy%20project",
    })
    expect(other.headers).toEqual({})
  })
})

describe("delegate mcp server", () => {
  const exchange = (env: Record<string, string>, lines: object[], wait: number) =>
    new Promise<any[]>((resolve) => {
      const child = spawn(process.execPath, [join(resources, "delegate/mcp.mjs")], {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "ignore"],
      })
      let out = ""
      child.stdout.on("data", (chunk) => (out += chunk))
      child.on("close", () =>
        resolve(
          out
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line)),
        ),
      )
      for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`)
      setTimeout(() => child.stdin.end(), wait)
    })

  test("lists the tool and runs a call against the app server with the parent id from its environment", async () => {
    const env = {
      VOID_DELEGATE_URL: server.url.href,
      VOID_DELEGATE_PASSWORD: "secret",
      VOID_DELEGATE_PARENT: "ses_parent",
      VOID_DELEGATE_DIRECTORY: "/work/project",
    }
    const replies = await exchange(
      env,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "delegate", arguments: { task: "do it", model: "openai/gpt-5-mini" } },
        },
      ],
      800,
    )

    expect(replies.map((reply) => reply.id).sort()).toEqual([1, 2, 3])
    expect(replies.find((reply) => reply.id === 1).result.protocolVersion).toBe("2025-03-26")
    expect(replies.find((reply) => reply.id === 2).result.tools[0].name).toBe("delegate")
    expect(replies.find((reply) => reply.id === 2).result.tools[0].annotations).toEqual({ readOnlyHint: true })
    expect(replies.find((reply) => reply.id === 3).result).toEqual({
      content: [{ type: "text", text: "first\nsecond\n\nsession: ses_child" }],
      isError: false,
    })
    expect(bodyOf("POST", "/session")?.parentID).toBe("ses_parent")
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`)
    expect(bodyOf("POST", "/session/ses_child/message").model).toEqual({ providerID: "openai", modelID: "gpt-5-mini" })
  })

  test("aborts the child when the client cancels the request", async () => {
    hold = true
    const handle = core.createMcp(core.createApi(base()), "ses_parent")
    const call = handle({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "delegate", arguments: { task: "t", model: "a/b" } },
    })
    await Bun.sleep(150)
    await handle({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } })

    expect((await call).result.content[0].text).toContain("session: ses_child")
    expect(seen.some((item) => item.path === "/session/ses_child/abort")).toBe(true)
  })

  const stopped = async (stop: "stdin" | "SIGTERM" | "SIGINT" | "SIGHUP", gap = 300) => {
    hold = true
    const child = spawn(process.execPath, [join(resources, "delegate/mcp.mjs")], {
      env: { ...process.env, VOID_DELEGATE_URL: server.url.href, VOID_DELEGATE_PARENT: "ses_parent" },
      stdio: ["pipe", "pipe", "ignore"],
    })
    const closed = new Promise<number | null>((resolve) => child.on("close", resolve))
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "delegate", arguments: { task: "t", model: "a/b" } } })}\n`,
    )
    await Bun.sleep(gap)
    if (stop === "stdin") child.stdin.end()
    else child.kill(stop)
    const code = await Promise.race([closed, Bun.sleep(6000).then(() => "timeout" as const)])
    if (code === "timeout") child.kill("SIGKILL")
    return code
  }
  const aborted = () => seen.some((item) => item.method === "POST" && item.path === "/session/ses_child/abort")

  for (const stop of ["stdin", "SIGTERM", "SIGINT", "SIGHUP"] as const) {
    test(`aborts the in-flight child and exits when ${stop === "stdin" ? "stdin closes" : `it gets ${stop}`}`, async () => {
      expect(await stopped(stop)).not.toBe("timeout")
      expect(aborted()).toBe(true)
    })
  }

  test("aborts a child that was created when the stop arrives before the prompt finishes starting", async () => {
    hold = true
    const slow = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        seen.push({ method: request.method, path: url.pathname, search: url.search, auth: null, body: undefined })
        if (request.method === "POST" && url.pathname === "/session") {
          await Bun.sleep(600)
          return Response.json({ id: "ses_child" })
        }
        if (url.pathname.endsWith("/abort")) return Response.json(true)
        return Response.json({ info: { id: "m", role: "assistant" }, parts: [] })
      },
    })
    const child = spawn(process.execPath, [join(resources, "delegate/mcp.mjs")], {
      env: { ...process.env, VOID_DELEGATE_URL: slow.url.href, VOID_DELEGATE_PARENT: "ses_parent" },
      stdio: ["pipe", "pipe", "ignore"],
    })
    const closed = new Promise((resolve) => child.on("close", resolve))
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "delegate", arguments: { task: "t", model: "a/b" } } })}\n`,
    )
    await Bun.sleep(150)
    child.kill("SIGTERM")
    await closed
    slow.stop(true)

    expect(aborted()).toBe(true)
    expect(seen.some((item) => item.path === "/session/ses_child/message")).toBe(false)
  })

  test("refuses at depth 2 as a tool error and creates no session", async () => {
    const replies = await exchange(
      { VOID_DELEGATE_URL: server.url.href, VOID_DELEGATE_PARENT: "ses_d2" },
      [
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "delegate", arguments: { task: "t", model: "a/b" } },
        },
      ],
      500,
    )

    expect(replies[0].result.isError).toBe(true)
    expect(replies[0].result.content[0].text).toContain("depth limit")
    expect(seen.some((item) => item.method === "POST")).toBe(false)
  })

  test("reports a failing call as a tool error", async () => {
    const replies = await exchange(
      { VOID_DELEGATE_URL: server.url.href, VOID_DELEGATE_PARENT: "ses_parent" },
      [
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "delegate", arguments: { task: "t", model: "nope" } },
        },
      ],
      500,
    )

    expect(replies[0].result.isError).toBe(true)
    expect(replies[0].result.content[0].text).toContain("provider/model")
  })
})
