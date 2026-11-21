import { homedir } from "node:os"
import { join, relative, resolve, isAbsolute } from "node:path"
import { HOME_SPACE_ID, spaceDir } from "./spaces"

export const VOID_HOME = join(homedir(), "void")

export const USER_XDG = ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"] as const

type UserXdg = Partial<Record<(typeof USER_XDG)[number], string | undefined>>

function insideRoot(root: string, value: string) {
  const rel = relative(resolve(root), resolve(value))
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function parseRecorded(recorded: string | undefined) {
  if (!recorded) return undefined
  try {
    const value = JSON.parse(recorded)
    return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export function userXdg(root: string, recorded: string | undefined, ...sources: (UserXdg | null | undefined)[]) {
  const kept = parseRecorded(recorded)
  const pick = (values: unknown[]) =>
    values.find((value): value is string => typeof value === "string" && value !== "" && !insideRoot(root, value))
  return Object.fromEntries(
    USER_XDG.map((key) => [key, kept ? pick([kept[key]]) : pick(sources.map((source) => source?.[key]))]),
  ) as Record<(typeof USER_XDG)[number], string | undefined>
}

export function voidAppEnv(root: string, user: UserXdg, spaceId = HOME_SPACE_ID) {
  const space = spaceDir(root, spaceId)
  return {
    XDG_DATA_HOME: join(space, "data"),
    XDG_CONFIG_HOME: join(space, "config"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(space, "state"),
    VOID_USER_ENV: JSON.stringify(Object.fromEntries(USER_XDG.map((key) => [key, user[key] || null]))),
    OPENCODE_DISABLE_CLAUDE_CODE: "true",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
  }
}

export function voidUserData(packaged: boolean, root = VOID_HOME) {
  return join(root, packaged ? "app" : "app-dev")
}
