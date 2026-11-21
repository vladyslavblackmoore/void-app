export const settingsTabPages = ["agents", "models", "settings"] as const

export type SettingsTabPage = (typeof settingsTabPages)[number]

export type SettingsTab = {
  type: "settings"
  page: SettingsTabPage
}

export const settingsTabs: SettingsTab[] = settingsTabPages.map((page) => ({ type: "settings", page }))

export const isSettingsTabPage = (value: unknown): value is SettingsTabPage =>
  typeof value === "string" && (settingsTabPages as readonly string[]).includes(value)

export const settingsTabHref = (page: SettingsTabPage) => `/settings/${page}`
