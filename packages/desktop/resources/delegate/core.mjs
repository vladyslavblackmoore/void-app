import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

export const toolName = "delegate"
export const serverName = "delegate"
export const mcpToolName = `mcp__${serverName}__${toolName}`
export const allowAll = [{ permission: "*", pattern: "*", action: "allow" }]

export const description =
  "Run a task in a separate child session on any connected provider and model, and return the child's final answer with its session id. " +
  "The child has its own context and full tool access, so describe the task completely. " +
  "model is provider/model such as openai/gpt-5 or subscription/sonnet; pass an empty string to use the current model. " +
  "agent is the name of an agent to run the task with; pass an empty string for the default agent."

export const toolArgs = {
  task: { type: "string", description: "The complete task for the child session" },
  model: { type: "string", description: "provider/model, or an empty string for the current model" },
  agent: { type: "string", description: "Agent name, or an empty string for the default agent" },
}

export const inputSchema = {
  type: "object",
  properties: {
    task: toolArgs.task,
    model: { type: "string", description: "provider/model; omit to use the current model" },
    agent: { type: "string", description: "Agent name; omit for the default agent" },
  },
  required: ["task"],
}

const pollAbortMs = 1000
const historyLimit = 20

function send(base, method, path, options = {}) {
  const url = new URL(path, base.url)
  if (base.directory) url.searchParams.set("directory", base.directory)
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  const headers = { accept: "application/json" }
  if (payload !== undefined) {
    headers["content-type"] = "application/json"
    headers["content-length"] = String(Buffer.byteLength(payload))
  }
  if (base.password) {
    headers.authorization = `Basic ${Buffer.from(`${base.username ?? "opencode"}:${base.password}`).toString("base64")}`
  }
  const open = url.protocol === "https:" ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = open(url, { method, headers }, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("error", reject)
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8")
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${method} ${url.pathname} failed with ${res.statusCode}: ${text.slice(0, 300)}`))
          return
        }
        if (!text.trim()) return resolve(undefined)
        try {
          resolve(JSON.parse(text))
        } catch {
          reject(new Error(`${method} ${url.pathname} returned invalid JSON`))
        }
      })
    })
    req.on("error", reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

export function createApi(base) {
  return {
    createSession: (body) => send(base, "POST", "/session", { body }),
    prompt: (id, body) => send(base, "POST", `/session/${id}/message`, { body }),
    abort: (id) => send(base, "POST", `/session/${id}/abort`),
    messages: (id) => send(base, "GET", `/session/${id}/message?limit=${historyLimit}`),
  }
}

export function parseModel(value) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return undefined
  const cut = text.indexOf("/")
  if (cut <= 0 || cut === text.length - 1) throw new Error(`model must be provider/model, got "${text}"`)
  return { providerID: text.slice(0, cut), modelID: text.slice(cut + 1) }
}

function newest(items) {
  return items.reduce(
    (best, item) => (!best || (item.time?.created ?? 0) >= (best.time?.created ?? 0) ? item : best),
    undefined,
  )
}

export async function parentModel(api, parentID) {
  const items = (await api.messages(parentID)) ?? []
  const assistant = newest(
    items.map((item) => item.info).filter((info) => info?.role === "assistant" && info.providerID && info.modelID),
  )
  if (assistant) return { providerID: assistant.providerID, modelID: assistant.modelID }
  const user = newest(items.map((item) => item.info).filter((info) => info?.role === "user" && info.model?.providerID))
  if (user) return { providerID: user.model.providerID, modelID: user.model.modelID }
  throw new Error("the parent model could not be determined; pass model as provider/model")
}

function finalText(parts) {
  return (parts ?? [])
    .filter((part) => part?.type === "text" && !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function errorText(error) {
  if (!error) return undefined
  const message = error.data?.message
  return typeof message === "string" && message ? `${error.name}: ${message}` : (error.name ?? "error")
}

function title(task) {
  const line = task.split("\n", 1)[0].trim().slice(0, 60)
  return `delegate: ${line}`
}

export async function runDelegate(api, input, signal) {
  const task = typeof input?.task === "string" ? input.task.trim() : ""
  if (!task) throw new Error("task is required")
  const requested = parseModel(input.model)
  const model = requested ?? (await parentModel(api, input.parentID))
  const agent = typeof input.agent === "string" && input.agent.trim() ? input.agent.trim() : undefined
  const session = await api.createSession({ parentID: input.parentID, title: title(task), permission: allowAll })
  const id = session.id
  if (signal?.aborted) {
    await api.abort(id).catch(() => undefined)
    return { id, text: "", error: "aborted" }
  }
  let timer
  const stop = () => {
    const press = () => api.abort(id).catch(() => undefined)
    void press()
    timer = setInterval(press, pollAbortMs)
  }
  signal?.addEventListener("abort", stop, { once: true })
  try {
    const result = await api.prompt(id, {
      model,
      ...(agent ? { agent } : {}),
      parts: [{ type: "text", text: task }],
    })
    return { id, text: finalText(result?.parts), error: errorText(result?.info?.error) }
  } finally {
    signal?.removeEventListener("abort", stop)
    clearInterval(timer)
  }
}

export function formatResult(result) {
  return [
    result.error ? `error: ${result.error}` : undefined,
    result.text || (result.error ? undefined : "(the child returned no text)"),
    `session: ${result.id}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n\n")
}

const protocolVersion = "2024-11-05"

export function createMcp(api, parentID) {
  const running = new Map()
  const reply = (id, result) => ({ jsonrpc: "2.0", id, result })
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } })
  const call = async (id, params) => {
    if (params?.name !== toolName) return fail(id, -32602, `unknown tool ${params?.name}`)
    const controller = new AbortController()
    running.set(id, controller)
    try {
      const result = await runDelegate(api, { ...params.arguments, parentID }, controller.signal)
      return reply(id, { content: [{ type: "text", text: formatResult(result) }], isError: Boolean(result.error) })
    } catch (error) {
      return reply(id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      })
    } finally {
      running.delete(id)
    }
  }
  return async (message) => {
    const { id, method, params } = message ?? {}
    if (method === "notifications/cancelled") {
      running.get(params?.requestId)?.abort()
      return undefined
    }
    if (id === undefined) return undefined
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: serverName, version: "1.0.0" },
      })
    }
    if (method === "ping") return reply(id, {})
    if (method === "tools/list") return reply(id, { tools: [{ name: toolName, description, inputSchema }] })
    if (method === "tools/call") return call(id, params)
    return fail(id, -32601, `method not found: ${method}`)
  }
}

export function serveMcp(handle, input, output) {
  let buffer = ""
  input.setEncoding("utf8")
  input.on("data", (chunk) => {
    buffer += chunk
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue
      }
      void handle(message).then((response) => {
        if (response) output.write(`${JSON.stringify(response)}\n`)
      })
    }
  })
}
