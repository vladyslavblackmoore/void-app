import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  createApi,
  description,
  formatResult,
  maxDepth,
  runDelegate,
  sessionDepth,
  toolArgs,
} from "../delegate/core.mjs"
import { childNote, closeStopped, memoryBlock, saveTasks } from "../delegate/memory.mjs"

const provider = "subscription"

const here = (name) => new URL(`../delegate/${name}`, import.meta.url)

const readText = (file) => readFile(file, "utf8").catch(() => "")

async function memoryDir() {
  try {
    return JSON.parse(await readText(here("paths.json"))).memoryDir
  } catch {
    return undefined
  }
}

async function readMemory(dir) {
  if (!dir) return {}
  const [index, rules, tasks] = await Promise.all(
    ["MEMORY.md", "RULES.md", "tasks.md"].map((name) => readText(join(dir, name))),
  )
  return { index, rules, tasks }
}

export default {
  id: "void.delegate",
  server: async (input) => {
    const api = (directory) =>
      createApi({
        url: input.serverUrl.href,
        username: process.env.OPENCODE_SERVER_USERNAME,
        password: process.env.OPENCODE_SERVER_PASSWORD,
        directory,
      })
    const depths = new Map()
    const depthOf = async (id) => {
      if (depths.has(id)) return depths.get(id)
      const depth = await sessionDepth(api(input.directory), id)
      depths.set(id, depth)
      return depth
    }
    return {
      tool: {
        delegate: {
          description,
          args: toolArgs,
          async execute(args, ctx) {
            const result = await runDelegate(api(ctx.directory), { ...args, parentID: ctx.sessionID }, ctx.abort)
            return {
              title: "delegate",
              output: formatResult(result),
              metadata: { sessionId: result.id, unconfirmed: Boolean(result.unfinished) },
            }
          },
        },
      },
      "chat.headers": async (hook, output) => {
        if (hook.model?.providerID !== provider) return
        output.headers["x-void-delegate-url"] = input.serverUrl.href
        output.headers["x-void-delegate-directory"] = encodeURIComponent(input.directory)
      },
      "experimental.chat.system.transform": async (hook, output) => {
        if (!hook.sessionID || hook.small || hook.agent === "compaction" || output.system.length === 0) return
        const depth = await depthOf(hook.sessionID).catch(() => undefined)
        if (depth === undefined) return
        const dir = await memoryDir()
        const memory = memoryBlock(await readMemory(dir), dir, depth === 0)
        const rules =
          depth === 0
            ? `${(await readText(here("manager.md"))).trim()}\n\nYour session id: ${hook.sessionID}`
            : `${depth >= maxDepth ? "Do not use delegate. " : ""}${childNote}`.trim()
        output.system[0] = [output.system[0], rules, memory].filter(Boolean).join("\n\n")
      },
      event: async ({ event }) => {
        if (event.type !== "session.error" || event.properties?.error?.name !== "MessageAbortedError") return
        const id = event.properties.sessionID
        const dir = await memoryDir()
        if (!id || !dir) return
        if ((await depthOf(id).catch(() => undefined)) !== 0) return
        const file = join(dir, "tasks.md")
        const text = await readText(file)
        const next = closeStopped(text, id)
        if (next.tasks !== text) await saveTasks(dir, next)
      },
    }
  },
}
