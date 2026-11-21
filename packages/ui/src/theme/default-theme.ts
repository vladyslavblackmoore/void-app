export const DEFAULT_THEME_ID = "void"

export function resolveThemeId(stored: string | null | undefined, fallback: string | undefined) {
  const id = stored ?? fallback ?? DEFAULT_THEME_ID
  return id === "oc-1" ? "oc-2" : id
}
