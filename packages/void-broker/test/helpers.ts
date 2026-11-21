import { mkdtemp } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { z } from "zod"

export const tempDir = () => mkdtemp(path.join(os.tmpdir(), "void-broker-"))

export const worker = (id: string) => ({
  id,
  backend: "acp" as const,
  model: "fake",
  effort: "low",
  mcp: [],
  warm: false,
  description: `worker ${id}`,
})

const message = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
})

export type Message = z.infer<typeof message>

export const text = (value: unknown) => z.string().parse(value)

export const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
  return undefined
}

export type Client = {
  send: (message: object) => void
  next: (match: (message: Message) => boolean) => Promise<Message>
  close: () => void
}

export function connect(socketPath: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath)
    const seen: Message[] = []
    const waiting: { match: (message: Message) => boolean; resolve: (message: Message) => void }[] = []
    let buffer = ""
    socket.setEncoding("utf8")
    socket.on("error", reject)
    socket.on("data", (chunk: string) => {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const parsed = message.parse(JSON.parse(line))
        const index = waiting.findIndex((entry) => entry.match(parsed))
        if (index === -1) seen.push(parsed)
        else waiting.splice(index, 1)[0]?.resolve(parsed)
      }
    })
    socket.on("connect", () =>
      resolve({
        send: (value) => socket.write(JSON.stringify(value) + "\n"),
        next: (match) => {
          const index = seen.findIndex(match)
          const found = seen.splice(index, 1)[0]
          if (index !== -1 && found) return Promise.resolve(found)
          return new Promise((done) => waiting.push({ match, resolve: done }))
        },
        close: () => socket.destroy(),
      }),
    )
  })
}
