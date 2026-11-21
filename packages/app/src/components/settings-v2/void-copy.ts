export const voidCopyKeys = [
  "settings.general.row.language.description",
  "settings.general.row.colorScheme.description",
  "settings.general.row.theme.description",
] as const

const keySet = new Set<string>(voidCopyKeys)

export function copyKey(isVoid: boolean, key: string) {
  if (isVoid && keySet.has(key)) return `void.copy.${key}`
  return key
}
