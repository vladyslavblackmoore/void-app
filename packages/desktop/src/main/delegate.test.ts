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
      ) => Promise<{ title: string; output: string; metadata: { sessionId: string } }>
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
      if (request.method === "POST" && url.pathname === "/session") return Response.json({ id: "ses_child" })
      if (url.pathname.endsWith("/abort")) {
        release?.()
        return Response.json(true)
      }
      if (request.method === "GET" && url.pathname === "/session/ses_parent/message")
        return Response.json(parentMessages)
      if (url.pathname === "/session/ses_child/message") {
        if (hold) await new Promise<void>((resolve) => (release = resolve))
        return Response.json({
          info: { id: "m9", role: "assistant" },
          parts: [
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
      title: "delegate: do it",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })
    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5-mini" },
      agent: "explore",
      parts: [{ type: "text", text: "do it" }],
    })
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`)
    expect(seen[0]!.search).toBe("?directory=%2Fwork%2Fproject")
    expect(core.formatResult(result)).toBe("first\nsecond\n\nsession: ses_child")
  })

  test("defaults the model to the newest assistant message of the parent and omits an empty agent", async () => {
    await core.runDelegate(core.createApi(base()), { task: "t", model: "", agent: "", parentID: "ses_parent" })

    expect(bodyOf("POST", "/session/ses_child/message")).toEqual({
      model: { providerID: "openai", modelID: "gpt-5" },
      parts: [{ type: "text", text: "t" }],
    })
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
    expect(output.metadata).toEqual({ sessionId: "ses_child" })
    expect(bodyOf("POST", "/session")?.parentID).toBe("ses_parent")
    expect(Object.keys(hooks.tool.delegate.args)).toEqual(["task", "model", "agent"])
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
