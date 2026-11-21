import { chmod, mkdir, rm } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { z } from "zod"
import { BrokerError, createBroker, type Broker, type BrokerOptions } from "./broker"

const request = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
})

const startParams = z.object({
  worker: z.string().min(1),
  prompt: z.string(),
  taskId: z.string().min(1).optional(),
  fresh: z.boolean().optional(),
})

const cancelParams = z.object({ runId: z.string().min(1) })

const codes = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 }

export type ServerOptions = BrokerOptions & { socketPath?: string }

export type BrokerServer = { socketPath: string; broker: Broker; close: () => Promise<void> }

export async function startServer(options: ServerOptions): Promise<BrokerServer> {
  const broker = await createBroker(options)
  const socketPath = options.socketPath ?? path.join(options.stateDir, "broker.sock")
  await mkdir(options.stateDir, { recursive: true, mode: 0o700 })
  await chmod(options.stateDir, 0o700)
  await rm(socketPath, { force: true })
  const sockets = new Set<net.Socket>()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    const runs = new Set<string>()
    const write = (message: object) => {
      if (!socket.destroyed) socket.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n")
    }
    const sink = {
      event: (runId: string, kind: string, text: string) =>
        write({ method: "delegate.event", params: { runId, kind, text } }),
      result: (runId: string, stopReason: string, text: string, usage: Record<string, number>, sessionId?: string) => {
        runs.delete(runId)
        write({ method: "delegate.result", params: { runId, stopReason, text, usage, sessionId: sessionId ?? "" } })
      },
    }

    async function dispatch(method: string, params: unknown) {
      if (method === "workers.list") return { workers: broker.workers() }
      if (method === "broker.health") return broker.health()
      if (method === "delegate.start") {
        const parsed = startParams.safeParse(params)
        if (!parsed.success) throw new BrokerError(codes.invalidParams, "invalid params")
        const runId = broker.startRun(parsed.data, sink)
        runs.add(runId)
        return { runId }
      }
      if (method === "delegate.cancel") {
        const parsed = cancelParams.safeParse(params)
        if (!parsed.success) throw new BrokerError(codes.invalidParams, "invalid params")
        await broker.cancelRun(parsed.data.runId)
        return { cancelled: true }
      }
      throw new BrokerError(codes.methodNotFound, `method not found: ${method}`)
    }

    async function handle(line: string) {
      let json: unknown
      try {
        json = JSON.parse(line)
      } catch {
        write({ id: null, error: { code: codes.parse, message: "parse error" } })
        return
      }
      const parsed = request.safeParse(json)
      if (!parsed.success) {
        write({ id: null, error: { code: codes.invalidRequest, message: "invalid request" } })
        return
      }
      const { id, method, params } = parsed.data
      try {
        const result = await dispatch(method, params)
        if (id !== undefined) write({ id, result })
      } catch (error) {
        if (id === undefined) return
        if (error instanceof BrokerError) write({ id, error: { code: error.code, message: error.message } })
        else write({ id, error: { code: codes.internal, message: "internal error" } })
      }
    }

    let buffer = ""
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) if (line.trim()) void handle(line)
    })
    socket.on("error", () => {})
    socket.on("close", () => {
      sockets.delete(socket)
      for (const runId of runs) void broker.cancelRun(runId).catch(() => {})
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, resolve)
  })
  await chmod(socketPath, 0o600)
  await broker.warm()

  return {
    socketPath,
    broker,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await broker.close()
      await rm(socketPath, { force: true })
    },
  }
}
