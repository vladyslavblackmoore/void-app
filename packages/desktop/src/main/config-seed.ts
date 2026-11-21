import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { applyEdits, findNodeAtLocation, modify, parseTree, type ParseError } from "jsonc-parser"

const CONFIG_STAMP = "config-seeded-1"
const MAIN_STAMP = "main-seeded-1"
const ROLES_STAMP = "roles-seeded-1"

const settings = ["provider", "subscription", "options", "defaultSettings"]

const defaults: Array<[string[], unknown]> = [
  [[...settings, "permissionMode"], "bypassPermissions"],
  [[...settings, "allowDangerouslySkipPermissions"], true],
]

const efforts = ["low", "medium", "high", "xhigh", "max"]

const worker = { model: "subscription/sonnet", variant: "medium" }

const roles: Array<[string, Record<string, string>]> = [
  ["architect", { model: "subscription/opus", variant: "high" }],
  ["doc", { model: "subscription/sonnet", variant: "medium" }],
  ["explorer", { model: "subscription/haiku" }],
]

const mains: Array<[string, Record<string, string>]> = [
  ["anthropic", { model: "anthropic/claude-sonnet-5-5", variant: "medium" }],
  ["openai", { model: "openai/gpt-6.2-sol", variant: "medium" }],
  ["google", { model: "google/gemini-4-neon" }],
  ["github-copilot", { model: "github-copilot/gpt-6.2-sol", variant: "medium" }],
]

const agent = (name: string, values: Record<string, string>) =>
  Object.entries(values).map(([key, value]): [string[], unknown] => [["agent", name, key], value])

async function writeIfChanged(target: string, content: string) {
  if ((await readFile(target, "utf8").catch(() => undefined)) === content) return
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

export type ConfigTemplates = { plugin?: string; mcpPlugin?: string; mcpMap?: string; config?: string }

export async function seedConfig(
  configDir: string,
  userDataDir: string,
  wrapper: string,
  authFile = "",
  templates: ConfigTemplates = {},
) {
  if (templates.mcpMap !== undefined) await writeIfChanged(join(configDir, "provider", "mcp-map.mjs"), templates.mcpMap)
  await writeIfChanged(join(configDir, "provider", "subscription.mjs"), wrapper)
  if (templates.plugin !== undefined) await writeIfChanged(join(configDir, "plugins", "subscription-auth.js"), templates.plugin)
  if (templates.mcpPlugin !== undefined)
    await writeIfChanged(join(configDir, "plugins", "subscription-mcp.js"), templates.mcpPlugin)
  if (templates.config !== undefined && !existsSync(join(configDir, "opencode.jsonc")))
    await writeFile(join(configDir, "opencode.jsonc"), templates.config)

  const seeded = existsSync(join(userDataDir, CONFIG_STAMP))
  const connected = Object.keys(JSON.parse((await readFile(authFile, "utf8").catch(() => undefined)) ?? "{}"))
  const main = mains.find(([provider]) => connected.includes(provider))?.[1]
  const mainSeeded = existsSync(join(userDataDir, MAIN_STAMP))
  const rolesSeeded = existsSync(join(userDataDir, ROLES_STAMP))
  if (seeded && rolesSeeded && (mainSeeded || !main)) return

  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, { allowTrailingComma: true })
  if (!tree || errors.length > 0 || !findNodeAtLocation(tree, ["provider", "subscription"])) return
  const missing = (path: string[]) => !findNodeAtLocation(tree, path)
  const next = [
    ...(seeded
      ? []
      : [
          ...defaults,
          ...(findNodeAtLocation(tree, ["provider", "subscription", "models"])?.children ?? []).flatMap((model) =>
            efforts.map((effort): [string[], unknown] => [
              ["provider", "subscription", "models", model.children?.[0]?.value, "variants", effort],
              { effort },
            ]),
          ),
          ...(missing(["agent", "worker", "model"]) ? agent("worker", worker) : []),
        ]),
    ...(rolesSeeded
      ? []
      : roles.flatMap(([name, values]) => (missing(["agent", name, "model"]) ? agent(name, values) : []))),
    ...(main && !mainSeeded && missing(["agent", "main", "model"]) ? agent("main", main) : []),
  ]
    .filter(([path]) => missing(path))
    .reduce(
      (result, [path, value]) =>
        applyEdits(result, modify(result, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
      text,
    )
  if (next !== text) await writeFile(file, next)
  await mkdir(userDataDir, { recursive: true })
  if (!seeded) await writeFile(join(userDataDir, CONFIG_STAMP), new Date().toISOString())
  if (!rolesSeeded) await writeFile(join(userDataDir, ROLES_STAMP), new Date().toISOString())
  if (main && !mainSeeded) await writeFile(join(userDataDir, MAIN_STAMP), new Date().toISOString())
}
