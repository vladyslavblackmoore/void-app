const VOID_DARK = "#0c0d0f"
const VOID_LIGHT = "#eceef1"
const SHARED_DARK = "#080808"
const SHARED_LIGHT = "#fafafa"

export function themeCanvas(themeId: string, isDark: boolean) {
  if (themeId === "void") return isDark ? VOID_DARK : VOID_LIGHT
  return isDark ? SHARED_DARK : SHARED_LIGHT
}
