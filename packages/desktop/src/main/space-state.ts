import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { isSpaceId } from "./spaces"

const STATE_DIR = "state"
const STATE_FILE = "spaces.json"

export function spaceStatePath(root: string) {
  return join(root, STATE_DIR, STATE_FILE)
}

async function readState(root: string): Promise<Record<string, unknown>> {
  const text = await readFile(spaceStatePath(root), "utf8").catch(() => undefined)
  if (text === undefined) return {}
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function readViewedSpace(root: string) {
  const { viewed } = await readState(root)
  return isSpaceId(viewed) ? viewed : undefined
}

export async function writeViewedSpace(root: string, id: string) {
  if (!isSpaceId(id)) throw new Error("invalid space id")
  const dir = join(root, STATE_DIR)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700)
  const state = await readState(root)
  const temp = join(dir, `${STATE_FILE}.${process.pid}.tmp`)
  await writeFile(temp, JSON.stringify({ ...state, viewed: id }, null, 2) + "\n", { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, spaceStatePath(root))
}
