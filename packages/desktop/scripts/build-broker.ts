#!/usr/bin/env bun
import { rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, "../../void-broker/src")
const outdir = process.argv[2] ?? join(here, "../resources/broker-runtime")

const esmEntries: Bun.BunPlugin = {
  name: "esm-entries",
  setup(build) {
    build.onResolve({ filter: /^jsonc-parser$/ }, (args) => ({
      path: join(dirname(Bun.resolveSync("jsonc-parser/package.json", args.importer || source)), "lib/esm/main.js"),
    }))
    build.onLoad({ filter: /@openclaw[\\/]fs-safe[\\/]dist[\\/]native\.js$/ }, async (args) => {
      const code = await Bun.file(args.path).text()
      return {
        loader: "js",
        contents: `import fsSafeManifest from "../package.json" with { type: "json" };\n${code.replace('require("../package.json")', "fsSafeManifest")}`,
      }
    })
  },
}

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
    plugins: [esmEntries],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}
