import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type MemoryTemplates = { index: string; tasks: string; rules: string }

export function memoryDir(root: string) {
  return join(root, "memory")
}

async function writeIfAbsent(file: string, content: string) {
  if (existsSync(file)) return
  await writeFile(file, content)
}

export async function seedMemory(root: string, templates: MemoryTemplates) {
  const dir = memoryDir(root)
  await mkdir(join(dir, "facts"), { recursive: true })
  await mkdir(join(dir, "journal"), { recursive: true })
  await writeIfAbsent(join(dir, "MEMORY.md"), templates.index)
  await writeIfAbsent(join(dir, "tasks.md"), templates.tasks)
  await writeIfAbsent(join(dir, "RULES.md"), templates.rules)
}
