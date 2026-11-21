import { useLanguage } from "@/context/language"
import { useVoidTheme } from "../void/use-void-theme"
import { copyKey } from "./void-copy"

export function useVoidCopy() {
  const language = useLanguage()
  const isVoid = useVoidTheme()
  return (key: string) => language.t(copyKey(isVoid(), key) as Parameters<typeof language.t>[0])
}
