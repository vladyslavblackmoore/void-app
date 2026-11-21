import { tool } from "@opencode-ai/plugin"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const CANCEL_GRACE_MS = 15000

const socketPath = () =>
  process.env["VOID_BROKER_SOCKET"] ??
  path.join(os.homedir(), "void", "spaces", process.env["VOID_SPACE_ID"] ?? "default", "state", "broker", "broker.sock")

type Message = { id?: unknown; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message?: string } }

const str = (value: unknown) => (typeof value === "string" ? value : "")

export default tool({
  description:
    "Hand one task to a subscription CLI worker through the VOID broker and wait for its final answer. The worker keeps its own session between calls unless fresh is true. The result holds the worker's final text, the stop reason, the run id and the worker session id.",
  args: {
    worker: tool.schema.string().describe("Worker id from the broker's workers list"),
    prompt: tool.schema.string().describe("The full self-contained instruction for the worker"),
    task_id: tool.schema.string().optional().describe("Board task id the worker should report against"),
    fresh: tool.schema.boolean().optional().describe("Start a new worker session instead of continuing the previous one"),
  },
  async execute(args, context) {
    const target = socketPath()
    return await new Promise((resolve, reject) => {
      const socket = net.connect(target)
      let buffer = ""
      let runId = ""
      let cancelSent = false
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let sessionId = ""

      const finish = (stopReason: string, text: string, id: string, session: string) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        context.abort.removeEventListener("abort", onAbort)
        socket.destroy()
        resolve({
          title: `delegate ${args.worker}`,
          output: `${text}\n\nstopReason: ${stopReason}\nrunId: ${id}\nsessionId: ${session}`,
          metadata: { worker: args.worker, stopReason, runId: id, sessionId: session },
        })
      }
      const fail = (message: string) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        context.abort.removeEventListener("abort", onAbort)
        socket.destroy()
        reject(new Error(message))
      }
      const cancel = () => {
        if (cancelSent || !runId) return
        cancelSent = true
        socket.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "delegate.cancel", params: { runId } }) + "\n")
        timer = setTimeout(() => finish("cancelled", "", runId, sessionId), CANCEL_GRACE_MS)
      }
      const onAbort = () => cancel()

      socket.setEncoding("utf8")
      socket.on("error", (error) => fail(`cannot reach the broker at ${target}: ${error.message}`))
      socket.on("close", () => fail("the broker closed the connection before the result"))
      socket.on("connect", () => {
        const params = { worker: args.worker, prompt: args.prompt, taskId: args.task_id, fresh: args.fresh }
        socket.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "delegate.start", params }) + "\n")
      })
      socket.on("data", (chunk: string) => {
        buffer += chunk
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          let message: Message
          try {
            message = JSON.parse(line)
          } catch {
            continue
          }
          if (message.id === 1) {
            if (message.error) return fail(message.error.message ?? "delegate.start failed")
            runId = str(message.result?.["runId"])
            if (context.abort.aborted) cancel()
          } else if (message.method === "delegate.result" && str(message.params?.["runId"]) === runId) {
            sessionId = str(message.params?.["sessionId"])
            return finish(str(message.params?.["stopReason"]), str(message.params?.["text"]), runId, sessionId)
          }
        }
      })
      context.abort.addEventListener("abort", onAbort)
      if (context.abort.aborted) onAbort()
    })
  },
})
