import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export async function seedAgents(configDir: string, agents: Array<{ name: string; content: string }>) {
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
}

function create(file: string, content: string) {
  return writeFile(file, content, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error
  })
}
