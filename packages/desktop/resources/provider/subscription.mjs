import { spawn } from "node:child_process"
import { mapMcpServers, mcpSanitize } from "./mcp-map.mjs"
import { createAuthenticationError, createClaudeCode, isAuthenticationError } from "ai-sdk-provider-claude-code"

export const notConnected = "Claude subscription is not connected. Open Settings → Providers and press Connect."

const statusLimit = 15 * 1000
const statusTtl = 3 * 1000
const loginPrefix = "not logged in"
const loginText = /^not logged in\b[\s\S]*\/login/i

function readStatus(binary, env) {
  return new Promise((resolve) => {
    const child = spawn(binary, ["auth", "status", "--json"], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "ignore"],
    })
    let out = ""
    child.stdout.on("data", (chunk) => {
      if (out.length < 65536) out += chunk
    })
    const timer = setTimeout(() => child.kill(), statusLimit)
    child.on("error", () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on("exit", () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(out).loggedIn === true)
      } catch {
        resolve(false)
      }
    })
  })
}

export function statusCheck(binary, env = {}) {
  let cache
  return () => {
    const now = Date.now()
    if (cache && now - cache.at < statusTtl) return cache.value
    const value = binary ? readStatus(binary, env) : Promise.resolve(true)
    cache = { at: now, value }
    value.then((signed) => {
      if (!signed && cache?.value === value) cache = undefined
    })
    return value
  }
}

function mapError(error) {
  if (!isAuthenticationError(error)) return error
  const message = typeof error.message === "string" ? error.message : ""
  if (/not logged in|\/login/i.test(message)) return createAuthenticationError({ message: notConnected })
  return error
}

function couldBeLogin(text) {
  const lower = text.trimStart().toLowerCase()
  return lower.startsWith(loginPrefix) || loginPrefix.startsWith(lower)
}

function cleanStream() {
  const held = new Map()
  const flush = (controller) => {
    for (const block of held.values()) for (const part of block.parts) controller.enqueue(part)
    held.clear()
  }
  return new TransformStream({
    transform(part, controller) {
      if (part.type === "text-start") {
        held.set(part.id, { parts: [part], text: "" })
        return
      }
      const block = held.get(part.id)
      if (part.type === "text-delta" && block) {
        block.parts.push(part)
        block.text += part.delta ?? ""
        if (!couldBeLogin(block.text)) {
          for (const item of block.parts) controller.enqueue(item)
          held.delete(part.id)
        }
        return
      }
      if (part.type === "text-end" && block) {
        held.delete(part.id)
        if (loginText.test(block.text.trim())) return
        for (const item of block.parts) controller.enqueue(item)
        controller.enqueue(part)
        return
      }
      if (part.type === "error") {
        const error = mapError(part.error)
        if (error !== part.error) held.clear()
        flush(controller)
        controller.enqueue(error === part.error ? part : { ...part, error })
        return
      }
      flush(controller)
      controller.enqueue(part)
    },
    flush(controller) {
      flush(controller)
    },
  })
}

async function ensureConnected(check) {
  if (!(await check())) throw createAuthenticationError({ message: notConnected })
}

export const mcpServers = (mcp) => mapMcpServers(mcp, "subscription")

function wildcard(input, pattern) {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  const source = escaped.endsWith(" .*") ? `${escaped.slice(0, -3)}( .*)?` : escaped
  return new RegExp(`^${source}$`, "s").test(input.replaceAll("\\", "/"))
}

export function ruleAction(name, rules) {
  const rule = rules.findLast((item) => wildcard(name, String(item.permission)) && wildcard("*", String(item.pattern)))
  return rule?.action ?? "ask"
}

function toolNames(tools) {
  if (!Array.isArray(tools)) return new Set()
  return new Set(tools.map((tool) => tool?.name).filter((name) => typeof name === "string"))
}

export function mcpGuard(servers, tools, rules) {
  const prefixes = Object.keys(servers)
    .map((name) => ({ prefix: `mcp__${mcpSanitize(name)}__`, server: mcpSanitize(name) }))
    .sort((a, b) => b.prefix.length - a.prefix.length)
  return async (input) => {
    const name = input?.tool_name
    if (typeof name !== "string" || !name.startsWith("mcp__")) return {}
    const match = prefixes.find((item) => name.startsWith(item.prefix))
    const key = match === undefined ? undefined : `${match.server}_${mcpSanitize(name.slice(match.prefix.length))}`
    if (key !== undefined && tools.has(key) && ruleAction(key, rules) !== "deny") return {}
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${name} is not permitted for this agent`,
      },
    }
  }
}

export function mcpPlan(mcp, tools, rules) {
  if (!Array.isArray(rules)) return
  const names = toolNames(tools)
  const servers = mcpServers(mcp)
  if (names.size === 0 || Object.keys(servers).length === 0) return
  return { servers, guard: mcpGuard(servers, names, rules) }
}

function callSettings(settings, effort, plan) {
  const withEffort = effort ? { ...settings, effort } : settings
  if (!plan) return withEffort
  return {
    ...withEffort,
    mcpServers: { ...withEffort?.mcpServers, ...plan.servers },
    strictMcpConfig: true,
    streamingInput: "always",
    hooks: {
      ...withEffort?.hooks,
      PreToolUse: [...(withEffort?.hooks?.PreToolUse ?? []), { matcher: "mcp__.*", hooks: [plan.guard] }],
    },
  }
}

export function wrapModel(build, check, key = "subscription") {
  const model = build()
  const call = (options) => {
    const own = options?.providerOptions?.[key]
    return build(own?.effort, mcpPlan(own?.mcp, options?.tools, own?.mcpRules))
  }
  return new Proxy(model, {
    get(target, key) {
      if (key === "doStream")
        return async (options) => {
          await ensureConnected(check)
          try {
            const result = await call(options).doStream(options)
            return { ...result, stream: result.stream.pipeThrough(cleanStream()) }
          } catch (error) {
            throw mapError(error)
          }
        }
      if (key === "doGenerate")
        return async (options) => {
          await ensureConnected(check)
          try {
            return await call(options).doGenerate(options)
          } catch (error) {
            throw mapError(error)
          }
        }
      const value = target[key]
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

export function spaceSettings(settings = {}, env = process.env) {
  const dir = env.VOID_SPACE_CLI_DIR
  if (!dir) {
    if (!Array.isArray(settings.settingSources) || settings.settingSources.length > 0) return settings
    const { settingSources: _dropped, ...rest } = settings
    return rest
  }
  if (settings.env?.CLAUDE_CONFIG_DIR) return settings
  return { ...settings, env: { ...settings.env, CLAUDE_CONFIG_DIR: dir } }
}

export function createSubscription(options = {}, factory = createClaudeCode) {
  const defaultSettings = spaceSettings(options.defaultSettings)
  const key = options.name ?? "subscription"
  const base = factory({ defaultSettings })
  const check = statusCheck(defaultSettings.pathToClaudeCodeExecutable, defaultSettings.env ?? {})
  const model = (modelId, settings) =>
    wrapModel((effort, plan) => base.languageModel(modelId, callSettings(settings, effort, plan)), check, key)
  const provider = (modelId, settings) => model(modelId, settings)
  return Object.assign(provider, base, { languageModel: model, chat: model, specificationVersion: "v3" })
}
