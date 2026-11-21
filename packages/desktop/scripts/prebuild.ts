#!/usr/bin/env bun
import { $ } from "bun"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`bun ./scripts/build-memory.ts`
await $`bun ./scripts/build-broker.ts`
await $`cd ../opencode && bun script/build-node.ts`
if (channel === "dev") await downloadCliToResources()
