export const DELEGATE_LABEL_MAX = 60

const absolutePath = /(?<![\w.:/~-])(?:~\/|\/)[^\s"'`<>()[\],;]+/g
const leadingNoise = /^(?:\s+|delegate:|\[delegated worker\])+/

function pathBasename(path: string) {
  const parts = path.split("/").filter((part) => part && part !== "~")
  return parts.at(-1) ?? ""
}

export function shortLabel(text: string | undefined, max = DELEGATE_LABEL_MAX) {
  if (!text) return ""
  const single = text.replace(absolutePath, pathBasename).replace(/\s+/g, " ").trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1).trimEnd() + "…"
}

export function delegateTaskLabel(input: Record<string, unknown> | undefined) {
  const value = input?.task ?? input?.description ?? input?.prompt
  if (typeof value !== "string") return ""
  return shortLabel(value.replace(leadingNoise, ""))
}

export function isDelegateTool(tool: string) {
  return tool === "delegate" || tool === "delegate_delegate" || tool === "mcp__delegate__delegate"
}

const unconfirmedHead = /^STATUS: UNCONFIRMED\b/
const sessionLine = /^session: (\S+)\s*$/m

export function unconfirmedSessionId(output: string | undefined) {
  if (typeof output !== "string" || !unconfirmedHead.test(output)) return undefined
  return sessionLine.exec(output)?.[1] ?? ""
}
