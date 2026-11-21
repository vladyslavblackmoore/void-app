import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { applyEdits, modify, parseTree, type ParseError } from "jsonc-parser"

export type MemoryRuntime = { command: string[]; environment: Record<string, string> }

export type MemoryRuntimeInput = {
  packaged: boolean
  sourceDir: string
  resourcesPath: string
  execPath: string
}

export function memoryCommand(input: MemoryRuntimeInput): MemoryRuntime {
  if (!input.packaged) return { command: ["bun", join(input.sourceDir, "src", "main.ts")], environment: {} }
  return {
    command: [input.execPath, join(input.resourcesPath, "void-memory", "main.mjs")],
    environment: { ELECTRON_RUN_AS_NODE: "1" },
  }
}

export function memoryPluginFile(input: Pick<MemoryRuntimeInput, "packaged" | "sourceDir" | "resourcesPath">) {
  if (!input.packaged) return join(input.sourceDir, "src", "plugin.ts")
  return join(input.resourcesPath, "void-memory", "plugin.mjs")
}

export async function seedMemory(spaceDir: string, configDir: string, runtime: MemoryRuntime | undefined) {
  if (runtime === undefined) return
  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const errors: ParseError[] = []
  if (!parseTree(text, errors) || errors.length > 0) return
  const database = join(spaceDir, "data", "memory", "graph.db")
  const next = [
    [["mcp", "memory", "type"], "local"],
    [["mcp", "memory", "command"], runtime.command],
    ...Object.entries(runtime.environment).map(([key, value]) => [["mcp", "memory", "environment", key], value]),
    [["mcp", "memory", "environment", "VOID_MEMORY_DB"], database],
  ].reduce(
    (result, [path, value]) =>
      applyEdits(result, modify(result, path as string[], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
    text,
  )
  await mkdir(join(spaceDir, "data", "memory"), { recursive: true })
  if (next !== text) await writeFile(file, next)
}

export function memoryPluginSource(pluginFile: string, database: string) {
  return [
    `import { memoryPlugin } from ${JSON.stringify(pathToFileURL(pluginFile).href)}`,
    `export default memoryPlugin(${JSON.stringify(database)})`,
    "",
  ].join("\n")
}

export async function seedMemoryPlugin(spaceDir: string, configDir: string, pluginFile: string | undefined) {
  if (pluginFile === undefined) return
  const target = join(configDir, "plugins", "void-memory.js")
  const content = memoryPluginSource(pluginFile, join(spaceDir, "data", "memory", "graph.db"))
  if ((await readFile(target, "utf8").catch(() => undefined)) === content) return
  await mkdir(join(configDir, "plugins"), { recursive: true })
  await writeFile(target, content)
}
