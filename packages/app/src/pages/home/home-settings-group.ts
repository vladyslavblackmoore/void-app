import { settingsTabHref, settingsTabPages, type SettingsTabPage } from "@/context/settings-tabs"

export const homeSettingsGroupItems = settingsTabPages.map((page) => ({
  page,
  href: settingsTabHref(page),
  label: `tab.settings.${page}` as const,
}))

export const homeSettingsGroupOpen = (toggled: boolean, current: SettingsTabPage | undefined) =>
  toggled || current !== undefined
