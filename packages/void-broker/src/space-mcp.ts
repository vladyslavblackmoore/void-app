import { readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "jsonc-parser"

const files = ["opencode.jsonc", "opencode.json"]

export function readSpaceMcp(dir: string | undefined): unknown {
  if (!dir) return undefined
  for (const name of files) {
    let text: string
    try {
      text = readFileSync(path.join(dir, name), "utf8")
    } catch {
      continue
    }
    const errors: unknown[] = []
    const parsed: unknown = parse(text, errors as never, { allowTrailingComma: true })
    if (errors.length > 0 || !parsed || typeof parsed !== "object") return undefined
    return (parsed as Record<string, unknown>)["mcp"]
  }
  return undefined
}
