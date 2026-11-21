import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const STAMP = "agents-seeded"
const STAMP_2 = "agents-seeded-2"
const TOOLS_STAMP = "tools-seeded"

export async function seedAgents(
  configDir: string,
  userDataDir: string,
  agents: Array<{ name: string; content: string; version?: number }>,
) {
  const first = !existsSync(join(userDataDir, STAMP))
  const second = !existsSync(join(userDataDir, STAMP_2))
  if (!first && !second) return
  const pending = agents.filter((agent) => ((agent.version ?? 1) === 1 ? first : second))
  await mkdir(join(configDir, "agents"), { recursive: true })
  await Promise.all(
    pending
      .filter((agent) => !existsSync(join(configDir, "agent", `${agent.name}.md`)))
      .map((agent) => create(join(configDir, "agents", `${agent.name}.md`), agent.content)),
  )
  if (first) {
    await create(
      join(configDir, "config.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", default_agent: "main" }, null, 2),
    )
  }
  await mkdir(userDataDir, { recursive: true })
  const stamped = new Date().toISOString()
  if (first) await create(join(userDataDir, STAMP), stamped)
  if (second) await create(join(userDataDir, STAMP_2), stamped)
}

export async function seedTools(
  configDir: string,
  userDataDir: string,
  tools: Array<{ name: string; content: string }>,
) {
  const stamp = join(userDataDir, TOOLS_STAMP)
  if (existsSync(stamp)) return
  await mkdir(join(configDir, "tools"), { recursive: true })
  await Promise.all(tools.map((tool) => create(join(configDir, "tools", `${tool.name}.ts`), tool.content)))
  await mkdir(userDataDir, { recursive: true })
  await create(stamp, new Date().toISOString())
}

function create(file: string, content: string) {
  return writeFile(file, content, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error
  })
}
