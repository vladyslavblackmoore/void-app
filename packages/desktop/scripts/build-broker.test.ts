import { expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { builtinModules } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const script = join(dirname(fileURLToPath(import.meta.url)), "build-broker.ts")
const shipped = ["broker.mjs", "shim.mjs"]

function specifiers(source: string) {
  const found = new Set<string>()
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\d*\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)) found.add(match[1])
  for (const match of source.matchAll(/define\(\s*\[([^\]]*)\]/g))
    for (const item of match[1].matchAll(/["']([^"']+)["']/g)) found.add(item[1])
  return [...found]
}

test("bundles the broker and shim into self-contained files", () => {
  const out = mkdtempSync(join(tmpdir(), "broker-build-"))
  try {
    const run = Bun.spawnSync(["bun", script, out], { stderr: "pipe", stdout: "pipe" })
    expect(run.exitCode).toBe(0)
    for (const file of shipped) {
      expect(existsSync(join(out, file))).toBe(true)
      for (const specifier of specifiers(readFileSync(join(out, file), "utf8"))) {
        if (specifier.startsWith(".")) {
          expect(existsSync(resolve(out, specifier))).toBe(true)
          continue
        }
        const bare = specifier.replace(/^node:/, "")
        expect(["require", "exports"].includes(bare) || builtinModules.includes(bare) || bare.startsWith("bun:")).toBe(true)
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
