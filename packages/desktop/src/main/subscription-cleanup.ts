import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { listSpaces, spaceDir } from "./spaces"

const CLEANUP_STAMP = "subscription-cleaned-1"
const PLUGIN_FILE = "subscription-auth.js"
const PROVIDER = "subscription"

function outside(parent: string, target: string) {
  const path = relative(resolve(parent), resolve(target))
  return path === ".." || path.startsWith("..") || isAbsolute(path)
}

async function writeAtomic(file: string, content: string) {
  const mode = (await stat(file)).mode & 0o777
  const temp = join(dirname(file), `.${process.pid}-${Date.now()}.tmp`)
  try {
    await writeFile(temp, content, { mode })
    await rename(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function dropStaleEntry(dir: string) {
  const file = join(dir, "data", "opencode", "auth.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return true
  let auth: Record<string, { metadata?: { configDir?: unknown } } | undefined>
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false
    auth = parsed
  } catch {
    return false
  }
  const configDir = auth[PROVIDER]?.metadata?.configDir
  if (typeof configDir !== "string" || !outside(join(dir, "cli"), configDir)) return true
  delete auth[PROVIDER]
  await writeAtomic(file, JSON.stringify(auth, null, 2))
  return true
}

async function cleanSpace(dir: string) {
  const stamp = join(dir, "state", CLEANUP_STAMP)
  if (await stat(stamp).then(() => true, () => false)) return
  await rm(join(dir, "config", "opencode", "plugin", PLUGIN_FILE), { force: true })
  if (!(await dropStaleEntry(dir))) return
  await mkdir(dirname(stamp), { recursive: true })
  await writeFile(stamp, new Date().toISOString())
}

export async function cleanSubscriptionInSpaces(root: string) {
  const spaces = await listSpaces(root)
  await Promise.all(spaces.map((space) => cleanSpace(spaceDir(root, space.id)).catch(() => undefined)))
}
