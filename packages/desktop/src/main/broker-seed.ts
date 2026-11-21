import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { addMissingLines } from "./seed-lines"

const STAMP = "broker-seeded"

const DELEGATE_LINES = [
  { agent: "main", line: "delegate: allow" },
  { agent: "worker", line: "delegate: deny" },
]

export async function seedBrokerWorkers(file: string, stateDir: string, template: string, account?: string) {
  const stamp = join(stateDir, STAMP)
  if (existsSync(stamp)) return
  const parsed = JSON.parse(template) as { workers: Array<Record<string, unknown>> }
  const content =
    account === undefined
      ? template
      : JSON.stringify(
          {
            ...parsed,
            workers: parsed.workers.map((worker) => (worker.backend === "anthropic-cli" ? { ...worker, account } : worker)),
          },
          null,
          2,
        ) + "\n"
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error
  })
  await mkdir(stateDir, { recursive: true })
  await writeFile(stamp, new Date().toISOString(), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error
  })
}

export async function addDelegatePermissions(configDir: string, stateDir: string) {
  for (const { agent, line } of DELEGATE_LINES)
    await addMissingLines({
      file: join(configDir, "agents", `${agent}.md`),
      stateDir,
      name: `${agent}-delegate`,
      version: 1,
      lines: [line],
      section: "permission",
    })
}
