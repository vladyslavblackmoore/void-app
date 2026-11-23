import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

export const toolName = "delegate"
export const serverName = "delegate"
export const mcpToolName = `mcp__${serverName}__${toolName}`
export const allowAll = [{ permission: "*", pattern: "*", action: "allow" }]
export const childPermission = [...allowAll, { permission: "question", pattern: "*", action: "deny" }]

export const description =
  "Run a task in a separate child session on any connected provider and model, and return the child's final answer with its session id. " +
  "The child has its own context and full tool access, so describe the task completely. " +
  "model is provider/model such as openai/gpt-5 or subscription/sonnet; pass an empty string to use the default model for children from the app settings, or the current model when none is set. " +
  "agent is the name of an agent to run the task with; pass an empty string for the default agent."

export const toolArgs = {
  task: { type: "string", description: "The complete task for the child session" },
  model: { type: "string", description: "provider/model, or an empty string for the children default" },
  agent: { type: "string", description: "Agent name, or an empty string for the default agent" },
}

export const inputSchema = {
  type: "object",
  properties: {
    task: toolArgs.task,
    model: { type: "string", description: "provider/model; omit to use the children default" },
    agent: { type: "string", description: "Agent name; omit for the default agent" },
  },
  required: ["task"],
}

export const maxDepth = 2
export const childAgent = "worker"
const pollAbortMs = 1000
const historyLimit = 20
const childHistoryLimit = 200

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
    session: (id) => send(base, "GET", `/session/${id}`),
    config: () => send(base, "GET", "/config"),
    abort: (id) => send(base, "POST", `/session/${id}/abort`),
    remove: (id) => send(base, "DELETE", `/session/${id}`),
    messages: (id, limit = historyLimit) => send(base, "GET", `/session/${id}/message?limit=${limit}`),
  }
}

export function parseModel(value) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return undefined
  const cut = text.indexOf("/")
  if (cut <= 0 || cut === text.length - 1) throw new Error(`model must be provider/model, got "${text}"`)
  return { providerID: text.slice(0, cut), modelID: text.slice(cut + 1) }
}

function agentEntryDefault(entry) {
  try {
    const model = parseModel(entry?.model)
    if (!model) return undefined
    const variant = typeof entry.variant === "string" ? entry.variant.trim() : ""
    return variant ? { model, variant } : { model }
  } catch {
    return undefined
  }
}

export function childDefault(config, agent) {
  const agents = config?.agent
  return (agent ? agentEntryDefault(agents?.[agent]) : undefined) ?? agentEntryDefault(agents?.[childAgent])
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

export async function sessionDepth(api, id) {
  let current = id
  for (let depth = 0; depth < maxDepth; depth++) {
    const parentID = (await api.session(current))?.parentID
    if (!parentID) return depth
    current = parentID
  }
  return maxDepth
}

export function workerNote(depth) {
  const rule =
    depth >= maxDepth ? "Do not use delegate." : "Delegate only if the task truly splits into independent parts."
  return `[delegated worker] You are a child session, not a manager. Do the task yourself with your own tools. You must finish all work in this turn: do not start background work you do not wait for, and do not promise to report later, because nothing can reach you or the owner after this turn ends. Your final answer is the result. ${rule}\n\n`
}

function title(task) {
  return task.split("\n", 1)[0].trim().slice(0, 60)
}

const backgroundLine = /(?<![&>])&(?![&>])|\b(nohup|disown|setsid)\b/
const waitLine = /^\s*wait\b|&\s*wait\b/
const quoted = /'[^'\n]*'|"[^"\n]*"/g
const maxResultChars = 20000
const promise =
  /\b(i'll|i will|i am going to|i'm going to)\b[^.\n]{0,40}\b(report|let you know|get back|notify you|update you|tell you)\b|\bonce\b[^.\n]{0,80}\b(finish|finishes|finished|completes|complete|done)\b[^.\n]{0,20}\bi('ll| will)\b|сообщу|доложу|дам знать|отпишусь|вернусь с результатом/i

function runsInBackground(command) {
  const lines = String(command ?? "").split("\n")
  const bare = lines.map((line) => line.replace(quoted, "''"))
  const last = bare.findLastIndex((line) => backgroundLine.test(line) && !waitLine.test(line))
  return last >= 0 && !bare.slice(last + 1).some((line) => waitLine.test(line))
}

export function unfinishedReason(parts) {
  for (const part of parts ?? []) {
    if (part?.type !== "tool" || !/^(bash|shell)$/i.test(part.tool ?? "")) continue
    const input = part.state?.input
    if (input?.run_in_background === true || runsInBackground(input?.command))
      return "it started a background process"
    if (part.state?.status === "running" || part.state?.status === "pending") return "a command was still running"
  }
  if (promise.test(finalText(parts).slice(-400))) return "its final text promises later work"
  return undefined
}

async function dropEmpty(api, id) {
  const items = await api.messages(id).catch(() => undefined)
  if (!items || items.some((item) => item?.info?.role === "assistant")) return false
  await api.remove(id).catch(() => undefined)
  return true
}

export async function runDelegate(api, input, signal) {
  const task = typeof input?.task === "string" ? input.task.trim() : ""
  if (!task) throw new Error("task is required")
  const requested = parseModel(input.model)
  const depth = await sessionDepth(api, input.parentID)
  if (depth >= maxDepth) {
    throw new Error(
      `delegate depth limit reached: this session is already ${depth} levels below the main session; do the task yourself`,
    )
  }
  const agent = typeof input.agent === "string" && input.agent.trim() ? input.agent.trim() : undefined
  const configured = requested ? undefined : childDefault(await api.config().catch(() => undefined), agent)
  const model = requested ?? configured?.model ?? (await parentModel(api, input.parentID))
  if (signal?.aborted) return { id: undefined, text: "", error: "aborted" }
  const session = await api.createSession({ parentID: input.parentID, title: title(task), permission: childPermission })
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
      ...(configured?.variant ? { variant: configured.variant } : {}),
      ...(agent ? { agent } : {}),
      parts: [{ type: "text", text: workerNote(depth + 1) + task }],
    })
    const error = errorText(result?.info?.error)
    const steps = error ? [] : ((await api.messages(id, childHistoryLimit).catch(() => undefined)) ?? [])
    const parts = [
      ...steps.filter((item) => item?.info?.role === "assistant").flatMap((item) => item.parts ?? []),
      ...(result?.parts ?? []),
    ]
    return { id, text: finalText(result?.parts), error, unfinished: error ? undefined : unfinishedReason(parts) }
  } catch (error) {
    if (!signal?.aborted && (await dropEmpty(api, id)) && requested) {
      throw new Error(
        `Model ${requested.providerID}/${requested.modelID} is not available. Leave model empty to use the default for children, or choose another model.`,
      )
    }
    throw error
  } finally {
    signal?.removeEventListener("abort", stop)
    clearInterval(timer)
  }
}

function capText(text, id) {
  if (text.length <= maxResultChars) return text
  return `${text.slice(0, maxResultChars)}\n\n[truncated: ${text.length - maxResultChars} more characters. Read session ${id} for the full output.]`
}

export function formatResult(result) {
  return [
    result.unfinished
      ? `STATUS: UNCONFIRMED - ${result.unfinished}\nThe child ended without finishing. Its result is not confirmed and nobody will report it later. Do not say the work is done or launched. The task stays Open in tasks.md, and your reply to the owner must say it is not confirmed. Rerun it in the foreground or finish it yourself.`
      : undefined,
    result.error ? `error: ${result.error}` : undefined,
    capText(result.text || (result.error ? "" : "(the child returned no text)"), result.id) || undefined,
    `session: ${result.id}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n\n")
}

const protocolVersion = "2024-11-05"

export function createMcp(api, parentID) {
  const running = new Map()
  const pending = new Set()
  const reply = (id, result) => ({ jsonrpc: "2.0", id, result })
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } })
  const call = async (id, params) => {
    if (params?.name !== toolName) return fail(id, -32602, `unknown tool ${params?.name}`)
    const controller = new AbortController()
    running.set(id, controller)
    const finished = Promise.withResolvers()
    pending.add(finished.promise)
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
      pending.delete(finished.promise)
      finished.resolve()
    }
  }
  const handle = async (message) => {
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
    if (method === "tools/list") return reply(id, { tools: [{ name: toolName, description, inputSchema, annotations: { readOnlyHint: true } }] })
    if (method === "tools/call") return call(id, params)
    return fail(id, -32601, `method not found: ${method}`)
  }
  handle.shutdown = async (limit = 3000) => {
    for (const controller of running.values()) controller.abort()
    await Promise.race([Promise.allSettled([...pending]), new Promise((resolve) => setTimeout(resolve, limit))])
  }
  return handle
}

export function serveMcp(handle, input, output, onClose) {
  let buffer = ""
  if (onClose) {
    input.on("end", onClose)
    input.on("close", onClose)
  }
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
