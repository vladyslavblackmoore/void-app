import { useTheme } from "@opencode-ai/ui/theme/context"

export const VOID_THEME_ID = "void"

export function useVoidTheme() {
  const theme = useTheme()
  return () => theme.themeId() === VOID_THEME_ID
}
