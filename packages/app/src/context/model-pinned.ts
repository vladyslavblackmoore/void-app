export function pinnedModelKeys(config: { agent?: Record<string, { model?: string } | undefined> } | undefined) {
  const keys = new Set<string>()
  for (const entry of Object.values(config?.agent ?? {})) {
    const text = entry?.model?.trim()
    if (!text) continue
    const cut = text.indexOf("/")
    if (cut <= 0 || cut === text.length - 1) continue
    keys.add(`${text.slice(0, cut)}:${text.slice(cut + 1)}`)
  }
  return keys
}
