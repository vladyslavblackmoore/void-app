import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { applyEdits, modify, parseTree, type ParseError } from "jsonc-parser"

export type MemoryCommandInput = {
  packaged: boolean
  sourceDir: string
  resourcesPath: string
  exists?: (path: string) => boolean
}

export function memoryCommand(input: MemoryCommandInput) {
  if (!input.packaged) return ["bun", join(input.sourceDir, "src", "main.ts")]
  const binary = join(input.resourcesPath, "void-memory", process.platform === "win32" ? "void-memory.exe" : "void-memory")
  return (input.exists ?? existsSync)(binary) ? [binary] : undefined
}

export async function seedMemory(spaceDir: string, configDir: string, command: string[] | undefined) {
  if (command === undefined) return
  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const errors: ParseError[] = []
  if (!parseTree(text, errors) || errors.length > 0) return
  const database = join(spaceDir, "data", "memory", "graph.db")
  const next = [
    [["mcp", "memory", "type"], "local"],
    [["mcp", "memory", "command"], command],
    [["mcp", "memory", "environment", "VOID_MEMORY_DB"], database],
  ].reduce(
    (result, [path, value]) =>
      applyEdits(result, modify(result, path as string[], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
    text,
  )
  await mkdir(join(spaceDir, "data", "memory"), { recursive: true })
  if (next !== text) await writeFile(file, next)
}

export function memoryPluginSource(sourceDir: string, database: string) {
  return [
    `import { memoryPlugin } from ${JSON.stringify(join(sourceDir, "src", "plugin.ts"))}`,
    `export default memoryPlugin(${JSON.stringify(database)})`,
    "",
  ].join("\n")
}

export async function seedMemoryPlugin(spaceDir: string, configDir: string, sourceDir: string | undefined) {
  if (sourceDir === undefined) return
  const target = join(configDir, "plugins", "void-memory.js")
  const content = memoryPluginSource(sourceDir, join(spaceDir, "data", "memory", "graph.db"))
  if ((await readFile(target, "utf8").catch(() => undefined)) === content) return
  await mkdir(join(configDir, "plugins"), { recursive: true })
  await writeFile(target, content)
}
