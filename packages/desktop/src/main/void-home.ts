import { homedir } from "node:os"
import { join } from "node:path"

export const VOID_HOME = join(homedir(), "void")

export const USER_XDG = ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"] as const

export function voidAppEnv(root: string, user: Partial<Record<(typeof USER_XDG)[number], string | undefined>>) {
  return {
    XDG_DATA_HOME: join(root, "data"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
    VOID_USER_ENV: JSON.stringify(Object.fromEntries(USER_XDG.map((key) => [key, user[key] || null]))),
  }
}

export function voidUserData(packaged: boolean, root = VOID_HOME) {
  return join(root, packaged ? "app" : "app-dev")
}
