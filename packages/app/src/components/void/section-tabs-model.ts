import type { LayoutRoute } from "@/context/layout"
import type { SettingsTabPage } from "@/context/settings-tabs"

export type VoidSection = "overview" | "chat" | "agents" | "models" | "hub" | "settings"

export type VoidSectionEntry = { id: VoidSection; available: boolean }

export type SectionTarget = { type: "home" } | { type: "chat" } | { type: "hub" } | { type: "settings"; page: SettingsTabPage }

export const voidSections: VoidSectionEntry[] = [
  { id: "overview", available: true },
  { id: "chat", available: true },
  { id: "agents", available: true },
  { id: "models", available: true },
  { id: "hub", available: true },
  { id: "settings", available: true },
]

export const visibleSections = () => voidSections.filter((item) => item.available)

export function sectionForRoute(route: LayoutRoute): VoidSection {
  if (route.type === "home") return "overview"
  if (route.type === "settings") {
    if (route.page === "agents") return "agents"
    if (route.page === "models") return "models"
    return "settings"
  }
  if (route.type === "hub") return "hub"
  return "chat"
}

export function sectionTarget(section: VoidSection): SectionTarget | undefined {
  if (section === "overview") return { type: "home" }
  if (section === "chat") return { type: "chat" }
  if (section === "agents") return { type: "settings", page: "agents" }
  if (section === "models") return { type: "settings", page: "models" }
  if (section === "settings") return { type: "settings", page: "settings" }
  if (section === "hub") return { type: "hub" }
  return undefined
}

export type SectionAction =
  | { type: "none" }
  | { type: "home" }
  | { type: "hub" }
  | { type: "settings"; page: SettingsTabPage }
  | { type: "chat-tab"; key: string }
  | { type: "chat-new" }

export function sectionAction(input: {
  section: VoidSection
  active: VoidSection
  lastChatKey: string | undefined
  chatKeys: string[]
}): SectionAction {
  if (input.section === input.active) return { type: "none" }
  const target = sectionTarget(input.section)
  if (!target) return { type: "none" }
  if (target.type === "home") return { type: "home" }
  if (target.type === "hub") return { type: "hub" }
  if (target.type === "settings") return { type: "settings", page: target.page }
  const key =
    input.lastChatKey !== undefined && input.chatKeys.includes(input.lastChatKey)
      ? input.lastChatKey
      : input.chatKeys[0]
  return key === undefined ? { type: "chat-new" } : { type: "chat-tab", key }
}
