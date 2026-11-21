import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const STAMP = "agents-seeded"
const TOOLS_STAMP = "tools-seeded"

export async function seedAgents(
  configDir: string,
  userDataDir: string,
  agents: Array<{ name: string; content: string }>,
) {
  const stamp = join(userDataDir, STAMP)
  if (existsSync(stamp)) return
  await mkdir(join(configDir, "agents"), { recursive: true })
  await Promise.all(
    agents
      .filter((agent) => !existsSync(join(configDir, "agent", `${agent.name}.md`)))
      .map((agent) => create(join(configDir, "agents", `${agent.name}.md`), agent.content)),
  )
  await create(
    join(configDir, "config.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", default_agent: "main" }, null, 2),
  )
  await mkdir(userDataDir, { recursive: true })
  await create(stamp, new Date().toISOString())
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
