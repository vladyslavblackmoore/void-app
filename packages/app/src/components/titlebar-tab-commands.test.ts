import { describe, expect, test } from "bun:test"
import { matchKeybind, parseKeybind } from "@/context/command"
import { SESSION_DRAFT_KEYBIND } from "./titlebar-tab-commands"

const press = (key: string) => new KeyboardEvent("keydown", { key, ctrlKey: true })

describe("session draft keybind", () => {
  test("opens a new session draft with mod+t and mod+n", () => {
    const binds = parseKeybind(SESSION_DRAFT_KEYBIND)
    expect(matchKeybind(binds, press("t"))).toBe(true)
    expect(matchKeybind(binds, press("n"))).toBe(true)
    expect(matchKeybind(binds, press("w"))).toBe(false)
  })
})
