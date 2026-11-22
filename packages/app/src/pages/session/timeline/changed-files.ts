import type { Part } from "@opencode-ai/sdk/v2"

const FILE_TOOLS = new Set(["edit", "write", "multiedit"])

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

function patchFiles(metadata: unknown) {
  const files = (metadata as { files?: unknown } | undefined)?.files
  if (!Array.isArray(files)) return []
  return files.flatMap((file: { filePath?: unknown; movePath?: unknown } | undefined) => {
    const path = text(file?.movePath) ?? text(file?.filePath)
    return path ? [path] : []
  })
}

export function changedFilePaths(parts: Part[]) {
  const paths = parts.flatMap((part) => {
    if (part.type !== "tool" || part.state.status !== "completed") return []
    if (part.tool === "apply_patch") return patchFiles(part.state.metadata)
    if (!FILE_TOOLS.has(part.tool)) return []
    const path = text(part.state.input.filePath)
    return path ? [path] : []
  })
  return [...new Set(paths)]
}

const ABSOLUTE = /^([\\/]|[a-zA-Z]:[\\/])/

export function resolveChangedFiles(files: string[], directory: string) {
  const base = directory.replace(/[\\/]+$/, "")
  const resolved = files.flatMap((file) => {
    if (ABSOLUTE.test(file)) return [file]
    return base ? [`${base}/${file}`] : []
  })
  return [...new Set(resolved)]
}

export function parentDirectory(file: string) {
  const index = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
  if (index < 0) return file
  if (index === 0) return file.slice(0, 1)
  return file.slice(0, index)
}

export function commonParent(files: string[]) {
  const lists = files.map((file) => parentDirectory(file).split(/[\\/]/))
  const first = lists[0]
  if (!first) return undefined
  const shared = first.filter((segment, index) => lists.every((list) => list[index] === segment))
  const length = shared.findIndex((segment, index) => segment !== first[index])
  const parts = length < 0 ? shared : shared.slice(0, length)
  const joined = parts.join("/")
  return joined || (ABSOLUTE.test(files[0]) && files[0].startsWith("/") ? "/" : undefined)
}

export async function openInDirectory(input: {
  files: string[]
  directory: string
  gitRoot: (directory: string) => Promise<string | null>
}) {
  const files = resolveChangedFiles(input.files, input.directory)
  if (files.length === 0) return input.directory
  for (const file of files) {
    const root = await input.gitRoot(parentDirectory(file)).catch(() => null)
    if (root) return root
  }
  return commonParent(files) ?? input.directory
}
