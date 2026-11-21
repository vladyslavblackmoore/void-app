import { readFile } from "node:fs/promises"
import { z } from "zod"

export const backends = ["anthropic-cli", "codex", "copilot", "acp"] as const

const entry = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    backend: z.enum(backends),
    model: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    account: z.string().min(1).optional(),
    mode: z.string().min(1).optional(),
    settingSources: z.string().optional(),
    mcp: z.array(z.string().min(1)).default([]),
    deny: z.array(z.string().regex(/^mcp__[A-Za-z0-9_*-]+$/)).optional(),
    warm: z.boolean().default(false),
    description: z.string().default(""),
  })
  .strict()

const file = z
  .object({
    maxActive: z.number().int().min(1).default(4),
    queueDepth: z.number().int().min(0).default(4),
    workers: z.array(entry),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    for (const worker of value.workers) {
      if (seen.has(worker.id)) ctx.addIssue({ code: "custom", message: `duplicate worker id: ${worker.id}` })
      seen.add(worker.id)
    }
  })

export type WorkerEntry = z.output<typeof entry>
export type WorkersConfig = z.output<typeof file>

export async function loadWorkers(path: string): Promise<WorkersConfig> {
  const text = await readFile(path, "utf8")
  return file.parse(JSON.parse(text))
}
