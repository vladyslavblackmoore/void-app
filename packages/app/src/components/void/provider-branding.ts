const LABELS: Record<string, string> = {
  opencode: "Free models",
  "opencode-go": "Go subscription",
}

const SLUGS: Record<string, string> = {
  opencode: "free",
  "opencode-go": "go",
}

const FREE_KEYS: Record<string, string> = {
  "provider.connect.opencodeZen.line1": "void.provider.connect.free.line1",
  "provider.connect.opencodeZen.line2": "void.provider.connect.free.line2",
}

const COMMON_KEYS: Record<string, string> = {
  "provider.connect.apiKey.description": "void.provider.connect.apiKey.description",
  "provider.connect.oauth.code.visit.suffix": "void.provider.connect.oauth.code.visit.suffix",
  "provider.connect.oauth.auto.visit.suffix": "void.provider.connect.oauth.auto.visit.suffix",
}

export const providerLabel = (isVoid: boolean, id: string, name: string) => (isVoid ? (LABELS[id] ?? name) : name)

export const providerSlug = (isVoid: boolean, id: string) => (isVoid ? (SLUGS[id] ?? id) : id)

export const connectCopyKey = (isVoid: boolean, id: string, key: string) => {
  if (!isVoid) return key
  if (id === "opencode" && FREE_KEYS[key]) return FREE_KEYS[key]
  return COMMON_KEYS[key] ?? key
}
