import { spawn } from "node:child_process"
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

export function wrapModel(build, check, key = "subscription") {
  const model = build()
  const call = (options) => build(options?.providerOptions?.[key]?.effort)
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

export function createSubscription(options = {}, factory = createClaudeCode) {
  const defaultSettings = options.defaultSettings ?? {}
  const key = options.name ?? "subscription"
  const base = factory({ defaultSettings })
  const check = statusCheck(defaultSettings.pathToClaudeCodeExecutable, defaultSettings.env ?? {})
  const model = (modelId, settings) =>
    wrapModel((effort) => base.languageModel(modelId, effort ? { ...settings, effort } : settings), check, key)
  const provider = (modelId, settings) => model(modelId, settings)
  return Object.assign(provider, base, { languageModel: model, chat: model, specificationVersion: "v3" })
}
