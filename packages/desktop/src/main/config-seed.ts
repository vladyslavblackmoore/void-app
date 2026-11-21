import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser"

const settings = ["provider", "subscription", "options", "defaultSettings"]

const defaults: Array<[string[], unknown]> = [
  [[...settings, "permissionMode"], "bypassPermissions"],
  [[...settings, "allowDangerouslySkipPermissions"], true],
]

const agents = (connected: string[]) => ({
  main: connected.includes("openai")
    ? { model: "openai/gpt-6.2-sol", variant: "medium" }
    : { model: "subscription/opus" },
  worker: { model: "subscription/sonnet" },
})

export async function seedConfig(configDir: string, wrapper: string, authFile = "") {
  const target = join(configDir, "provider", "subscription.mjs")
  if ((await readFile(target, "utf8").catch(() => undefined)) !== wrapper) {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, wrapper)
  }

  const file = join(configDir, "opencode.jsonc")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return
  const tree = parseTree(text)
  if (!tree || !findNodeAtLocation(tree, ["provider", "subscription"])) return
  const connected = Object.keys(JSON.parse((await readFile(authFile, "utf8").catch(() => undefined)) ?? "{}"))
  const next = [
    ...defaults,
    ...Object.entries(agents(connected))
      .filter(([name]) => !findNodeAtLocation(tree, ["agent", name, "model"]))
      .flatMap(([name, values]) =>
        Object.entries(values).map(([key, value]): [string[], unknown] => [["agent", name, key], value]),
      ),
  ]
    .filter(([path]) => !findNodeAtLocation(tree, path))
    .reduce(
      (result, [path, value]) =>
        applyEdits(result, modify(result, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
      text,
    )
  if (next !== text) await writeFile(file, next)
}
