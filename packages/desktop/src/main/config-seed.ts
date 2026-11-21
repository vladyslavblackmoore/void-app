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

export async function seedConfig(configDir: string, userDataDir: string, wrapper: string) {
  const target = join(configDir, "provider", "subscription.mjs")
  if ((await readFile(target, "utf8").catch(() => undefined)) !== wrapper) {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, wrapper)
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
