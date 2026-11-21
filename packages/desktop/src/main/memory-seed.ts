import { existsSync } from "node:fs"
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

const PERMISSIONS_STAMP = "memory-seeded-1"

const permissionRules: Array<[string, string[]]> = [
  ["main", ['"memory_*": allow']],
  [
    "worker",
    [
      '"memory_*": deny',
      ...[
        "remember",
        "recall",
        "open",
        "link",
        "task_create",
        "task_claim",
        "task_update",
        "task_result",
        "task_list",
        "board_changes",
      ].map((tool) => `memory_${tool}: allow`),
    ],
  ],
]

const ruleKey = (line: string) => line.slice(0, line.indexOf(":")).trim().replace(/^"|"$/g, "")

function addRules(text: string, rules: string[]) {
  const lines = text.split("\n")
  if (lines[0] !== "---") return text
  const end = lines.indexOf("---", 1)
  const start = lines.indexOf("permission:")
  if (end < 0 || start < 1 || start > end) return text
  let last = start
  while (last + 1 < end && lines[last + 1].startsWith("  ")) last++
  const present = new Set(
    lines
      .slice(start + 1, last + 1)
      .filter((line) => !line.startsWith("   "))
      .map(ruleKey),
  )
  const missing = rules.filter((rule) => !present.has(ruleKey(rule)))
  if (missing.length === 0) return text
  lines.splice(last + 1, 0, ...missing.map((rule) => `  ${rule}`))
  return lines.join("\n")
}

export async function seedMemoryPermissions(configDir: string, userDataDir: string) {
  if (existsSync(join(userDataDir, PERMISSIONS_STAMP))) return
  await Promise.all(
    permissionRules.map(async ([name, rules]) => {
      const file = join(configDir, "agents", `${name}.md`)
      const text = await readFile(file, "utf8").catch(() => undefined)
      if (text === undefined) return
      const next = addRules(text, rules)
      if (next !== text) await writeFile(file, next)
    }),
  )
  await mkdir(userDataDir, { recursive: true })
  await writeFile(join(userDataDir, PERMISSIONS_STAMP), new Date().toISOString())
}
