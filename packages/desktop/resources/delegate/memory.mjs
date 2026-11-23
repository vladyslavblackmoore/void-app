export const indexLimit = 6000
export const rulesLimit = 4000
export const doneKeep = 5
export const doneLimit = 50

export const childNote =
  "You are a child session, not a manager. Finish in this turn: leave no background work running and never say you will report later or check back.\nMemory in your context is read-only for you: do not write tasks.md or the journal.\n\n"

export function capMemory(text, limit, path) {
  const body = text.trim()
  if (body.length <= limit) return body
  const cut = body.slice(0, limit)
  const line = cut.lastIndexOf("\n")
  return `${line > 0 ? cut.slice(0, line) : cut}\n[truncated: read the full file at ${path}]`
}

function sectionEnd(lines, start) {
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  return next < 0 ? lines.length : next
}

export function tasksDigest(text, keep = doneKeep) {
  const lines = text.split("\n")
  const done = lines.findIndex((line) => /^##\s+Done\b/i.test(line))
  if (done < 0) return text.trim()
  const end = sectionEnd(lines, done)
  const items = lines.slice(done + 1, end).filter((line) => line.startsWith("- "))
  const shown = items.slice(0, keep)
  const omitted = items.length - shown.length
  const after = end < lines.length ? ["", ...lines.slice(end)] : []
  return [...lines.slice(0, done + 1), ...(omitted > 0 ? [`(${omitted} older done items omitted)`] : []), ...shown, ...after]
    .join("\n")
    .trim()
}

export function pruneDone(text, limit = doneLimit) {
  const lines = text.split("\n")
  const done = lines.findIndex((line) => /^##\s+Done\b/i.test(line))
  if (done < 0) return text
  const end = sectionEnd(lines, done)
  let count = 0
  const kept = lines.filter((line, index) => {
    if (index <= done || index >= end || !line.startsWith("- ")) return true
    count++
    return count <= limit
  })
  return kept.length === lines.length ? text : kept.join("\n")
}

export function closeStopped(text, id) {
  const lines = text.split("\n")
  const open = lines.findIndex((line) => /^##\s+Open\b/i.test(line))
  if (open < 0) return text
  const end = sectionEnd(lines, open)
  const tag = `- [${id}]`
  const section = lines.slice(open + 1, end)
  const stopped = section.filter((line) => line.startsWith(tag)).map((line) => `${line.trimEnd()} (stopped)`)
  if (stopped.length === 0) return text
  const result = [...lines.slice(0, open + 1), ...section.filter((line) => !line.startsWith(tag)), ...lines.slice(end)]
  let done = result.findIndex((line) => /^##\s+Done\b/i.test(line))
  if (done < 0) {
    result.push("", "## Done")
    done = result.length - 1
  }
  result.splice(done + 1, 0, ...stopped)
  return pruneDone(result.join("\n"))
}

export function memoryBlock(files, dir, top) {
  const parts = [
    files.index && `# Memory index (${dir}/MEMORY.md)\n${capMemory(files.index, indexLimit, `${dir}/MEMORY.md`)}`,
    files.rules && `# Memory rules (${dir}/RULES.md)\n${capMemory(files.rules, rulesLimit, `${dir}/RULES.md`)}`,
    top && files.tasks && `# Tasks (${dir}/tasks.md)\n${tasksDigest(files.tasks)}`,
  ]
  return parts.filter(Boolean).join("\n\n")
}
