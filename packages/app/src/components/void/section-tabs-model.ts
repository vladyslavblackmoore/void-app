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
