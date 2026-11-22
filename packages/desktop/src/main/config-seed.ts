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

const efforts = ["low", "medium", "high", "xhigh", "max"]

async function writeIfChanged(target: string, content: string) {
  if ((await readFile(target, "utf8").catch(() => undefined)) === content) return
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

export type ConfigTemplates = { plugin?: string; config?: string }

export async function seedConfig(configDir: string, userDataDir: string, wrapper: string, templates: ConfigTemplates = {}) {
  await writeIfChanged(join(configDir, "provider", "subscription.mjs"), wrapper)
  if (templates.plugin !== undefined) await writeIfChanged(join(configDir, "plugins", "subscription-auth.js"), templates.plugin)
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
