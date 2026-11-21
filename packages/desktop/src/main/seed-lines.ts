import { existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type AddMissingLines = {
  file: string
  stateDir: string
  name: string
  version: number
  lines: string[]
  section?: string
  heading?: string
  marker?: string
}

const keyOf = (line: string) => {
  const trimmed = line.trim()
  const colon = trimmed.indexOf(":")
  return colon === -1 ? trimmed : trimmed.slice(0, colon)
}

const indentOf = (line: string) => line.slice(0, line.length - line.trimStart().length)

function insertIntoSection(rows: string[], section: string, lines: string[]) {
  if (rows[0]?.trim() !== "---") return undefined
  const close = rows.findIndex((row, index) => index > 0 && row.trim() === "---")
  if (close === -1) return undefined
  const head = rows.findIndex((row, index) => index > 0 && index < close && row.trimEnd() === `${section}:`)
  if (head === -1) return undefined
  let end = head
  while (end + 1 < close && /^\s+\S/.test(rows[end + 1]!)) end++
  const first = rows[head + 1]
  const indent = end > head && first !== undefined ? indentOf(first) : "  "
  const present = new Set(rows.slice(head + 1, end + 1).map(keyOf))
  const missing = lines.filter((line) => !present.has(keyOf(line)))
  if (missing.length === 0) return undefined
  return [...rows.slice(0, end + 1), ...missing.map((line) => indent + line), ...rows.slice(end + 1)]
}

function insertUnderHeading(rows: string[], heading: string, lines: string[], marker?: string) {
  const head = rows.findIndex((row) => row.trimEnd() === `## ${heading}`)
  if (head === -1) return undefined
  if (marker !== undefined && rows.some((row) => row.includes(marker))) return undefined
  const present = new Set(rows.map((row) => row.trim()))
  const missing = lines.filter((line) => !present.has(line.trim()))
  if (missing.length === 0) return undefined
  const next = rows.findIndex((row, index) => index > head && row.startsWith("## "))
  const limit = next === -1 ? rows.length : next
  let end = head
  for (let index = head + 1; index < limit; index++) if (rows[index]!.trim() !== "") end = index
  return [...rows.slice(0, end + 1), ...missing, ...rows.slice(end + 1)]
}

function appendToEnd(rows: string[], lines: string[]) {
  const present = new Set(rows.map(keyOf))
  const missing = lines.filter((line) => !present.has(keyOf(line)))
  if (missing.length === 0) return undefined
  const body = rows.at(-1) === "" ? rows.slice(0, -1) : rows
  return [...body, ...missing, ""]
}

export async function addMissingLines(options: AddMissingLines) {
  const stamp = join(options.stateDir, `${options.name}-seeded-${options.version}`)
  if (existsSync(stamp)) return false
  const text = await readFile(options.file, "utf8").catch(() => undefined)
  if (text === undefined) return false
  const eol = text.includes("\r\n") ? "\r\n" : "\n"
  const rows = text.split(eol)
  const next =
    options.heading !== undefined
      ? insertUnderHeading(rows, options.heading, options.lines, options.marker)
      : options.section === undefined
        ? appendToEnd(rows, options.lines)
        : insertIntoSection(rows, options.section, options.lines)
  if (next) {
    const temp = `${options.file}.${process.pid}.tmp`
    await writeFile(temp, next.join(eol))
    await rename(temp, options.file)
  }
  await mkdir(options.stateDir, { recursive: true })
  await writeFile(stamp, new Date().toISOString(), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error
  })
  return next !== undefined
}
