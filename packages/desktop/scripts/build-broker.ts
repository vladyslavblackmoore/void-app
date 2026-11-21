#!/usr/bin/env bun
import { rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, "../../void-broker/src")
const outdir = join(here, "../resources/broker-runtime")

await rm(outdir, { recursive: true, force: true })

for (const [entry, name] of [
  ["main.ts", "broker"],
  ["shim/main.ts", "shim"],
] as const) {
  const result = await Bun.build({
    entrypoints: [join(source, entry)],
    outdir,
    target: "node",
    format: "esm",
    naming: `${name}.mjs`,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}
