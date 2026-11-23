import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser"

const settings = ["provider", "subscription", "options", "defaultSettings"]

const defaults: Array<[string[], unknown]> = [
  [[...settings, "permissionMode"], "bypassPermissions"],
  [[...settings, "allowDangerouslySkipPermissions"], true],
]

const CONFIG_STAMP = "config-seeded-1"
const MEMORY_STAMP = "config-seeded-2"
const HAIKU_STAMP = "config-seeded-3"
const INJECT_STAMP = "config-seeded-5"
const MEMORY_FILES = ["MEMORY.md", "tasks.md", "RULES.md"]

const efforts = ["low", "medium", "high", "xhigh", "max"]

async function writeIfChanged(target: string, content: string) {
  if ((await readFile(target, "utf8").catch(() => undefined)) === content) return
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

export type DelegateTemplates = { plugin: string; core: string; mcp: string; manager?: string; memory?: string }

export type ConfigTemplates = { plugin?: string; config?: string; delegate?: DelegateTemplates }

const format = { formattingOptions: { insertSpaces: true, tabSize: 2 } }

function appendMissing(text: string, path: string[], values: string[]) {
  const tree = parseTree(text)
  const node = tree && findNodeAtLocation(tree, path)
  if (node && node.type !== "array") return text
  const present = (node?.children ?? []).map((child) => child.value)
  return values
    .filter((value) => !present.includes(value))
    .reduce(
      (result, value) =>
        applyEdits(result, modify(result, [...path, -1], value, { ...format, isArrayInsertion: true })),
      text,
    )
}

function allowDirectory(text: string, pattern: string) {
  const tree = parseTree(text)
  if (!tree) return text
  const parents = [["permission"], ["permission", "external_directory"]].map((path) => findNodeAtLocation(tree, path))
  if (parents.some((node) => node && node.type !== "object")) return text
  if (findNodeAtLocation(tree, ["permission", "external_directory", pattern])) return text
  return applyEdits(text, modify(text, ["permission", "external_directory", pattern], "allow", format))
}

function withMemory(text: string, memoryDir: string) {
  const withSettings = appendMissing(text, [...settings, "additionalDirectories"], [memoryDir])
  return allowDirectory(withSettings, join(memoryDir, "*"))
}

async function seedMemoryKeys(configDir: string, userDataDir: string, memoryDir: string) {
  if (existsSync(join(userDataDir, MEMORY_STAMP))) return
  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const tree = parseTree(text)
  if (!tree || !findNodeAtLocation(tree, ["provider", "subscription"])) return
  const next = withMemory(text, memoryDir)
  if (next !== text) await writeFile(file, next)
  await mkdir(userDataDir, { recursive: true })
  await writeFile(join(userDataDir, MEMORY_STAMP), new Date().toISOString())
}

export async function seedConfig(
  configDir: string,
  userDataDir: string,
  wrapper: string,
  templates: ConfigTemplates = {},
  memoryDir?: string,
) {
  await seedMainConfig(configDir, userDataDir, wrapper, templates, memoryDir)
  await seedHaiku(configDir, userDataDir)
  if (memoryDir !== undefined) await seedMemoryKeys(configDir, userDataDir, memoryDir)
  await seedInjection(configDir, userDataDir, memoryDir)
}

function managerFile(configDir: string) {
  return join(configDir, "delegate", "manager.md")
}

function removeValues(text: string, path: string[], values: string[]) {
  const tree = parseTree(text)
  const node = tree && findNodeAtLocation(tree, path)
  if (!node || node.type !== "array") return text
  const children = node.children ?? []
  const kept = children.filter((child) => !values.includes(child.value))
  if (kept.length === children.length) return text
  if (kept.length === 0) return applyEdits(text, modify(text, path, undefined, format))
  return children.reduceRight(
    (result, child, index) =>
      values.includes(child.value) ? applyEdits(result, modify(result, [...path, index], undefined, format)) : result,
    text,
  )
}

async function seedInjection(configDir: string, userDataDir: string, memoryDir?: string) {
  if (existsSync(join(userDataDir, INJECT_STAMP))) return
  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const entries = [
    managerFile(configDir),
    ...(memoryDir === undefined ? [] : MEMORY_FILES.map((name) => join(memoryDir, name))),
  ]
  const next = removeValues(text, ["instructions"], entries)
  if (next !== text) await writeFile(file, next)
  await mkdir(userDataDir, { recursive: true })
  await writeFile(join(userDataDir, INJECT_STAMP), new Date().toISOString())
}

async function seedHaiku(configDir: string, userDataDir: string) {
  if (existsSync(join(userDataDir, HAIKU_STAMP))) return
  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const tree = parseTree(text)
  if (!tree || !findNodeAtLocation(tree, ["provider", "subscription"])) return
  const modelsNode = findNodeAtLocation(tree, ["provider", "subscription", "models"])
  if (modelsNode && modelsNode.type !== "object") return
  const base = ["provider", "subscription", "models", "haiku"]
  const edits: Array<[string[], unknown]> = [
    [base, { name: "Haiku" }],
    ...efforts.map((effort): [string[], unknown] => [[...base, "variants", effort], { effort }]),
  ]
  const next = edits
    .filter(([path]) => !findNodeAtLocation(tree, path))
    .reduce((result, [path, value]) => applyEdits(result, modify(result, path, value, format)), text)
  if (next !== text) await writeFile(file, next)
  await mkdir(userDataDir, { recursive: true })
  await writeFile(join(userDataDir, HAIKU_STAMP), new Date().toISOString())
}

async function seedMainConfig(
  configDir: string,
  userDataDir: string,
  wrapper: string,
  templates: ConfigTemplates,
  memoryDir?: string,
) {
  await writeIfChanged(join(configDir, "provider", "subscription.mjs"), wrapper)
  if (templates.plugin !== undefined)
    await writeIfChanged(join(configDir, "plugins", "subscription-auth.js"), templates.plugin)
  if (templates.delegate !== undefined) {
    await writeIfChanged(join(configDir, "plugins", "delegate.js"), templates.delegate.plugin)
    await writeIfChanged(join(configDir, "delegate", "core.mjs"), templates.delegate.core)
    await writeIfChanged(join(configDir, "delegate", "mcp.mjs"), templates.delegate.mcp)
    if (templates.delegate.manager !== undefined)
      await writeIfChanged(managerFile(configDir), templates.delegate.manager)
    if (templates.delegate.memory !== undefined)
      await writeIfChanged(join(configDir, "delegate", "memory.mjs"), templates.delegate.memory)
    if (memoryDir !== undefined)
      await writeIfChanged(join(configDir, "delegate", "paths.json"), JSON.stringify({ memoryDir }))
  }
  if (templates.config !== undefined && !existsSync(join(configDir, "opencode.jsonc"))) {
    await mkdir(configDir, { recursive: true })
    await writeFile(join(configDir, "opencode.jsonc"), templates.config)
  }

  if (existsSync(join(userDataDir, CONFIG_STAMP))) return

  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const tree = parseTree(text)
  if (!tree || !findNodeAtLocation(tree, ["provider", "subscription"])) return
  const next = [
    ...defaults,
    ...(findNodeAtLocation(tree, ["provider", "subscription", "models"])?.children ?? []).flatMap((model) =>
      efforts.map((effort): [string[], unknown] => [
        ["provider", "subscription", "models", model.children?.[0]?.value, "variants", effort],
        { effort },
      ]),
    ),
  ]
    .filter(([path]) => !findNodeAtLocation(tree, path))
    .reduce(
      (result, [path, value]) =>
        applyEdits(result, modify(result, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
      text,
    )
  if (next !== text) await writeFile(file, next)
  await mkdir(userDataDir, { recursive: true })
  await writeFile(join(userDataDir, CONFIG_STAMP), new Date().toISOString())
}
