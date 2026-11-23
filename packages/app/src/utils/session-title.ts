const pattern = /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

interface Info {
  readonly title?: string
  readonly parentID?: string
  readonly time: {
    readonly created: number
  }
}

export function withTimestampedFallback(info: Info) {
  return info.title ?? `${info.parentID ? "Child" : "New"} session - ${new Date(info.time.created).toISOString()}`
}

export function sessionTitle(title?: string) {
  if (!title) return title
  const match = title.match(pattern)
  return match?.[1] ?? title
}

const defaultPattern = /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function isDefaultSessionTitle(title?: string) {
  return !!title && defaultPattern.test(title)
}

export function fallbackSessionTitle(text: string | undefined, max = 60) {
  const single = (text ?? "").replace(/\s+/g, " ").trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1).trimEnd() + "\u2026"
}
