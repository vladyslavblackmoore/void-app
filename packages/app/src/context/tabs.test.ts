import { describe, expect, test } from "bun:test"
import { createRoot, getOwner, onCleanup } from "solid-js"
import { createTabMemory } from "./tab-memory"
import { nextTabAfterClose, pushClosedTab, removeClosedTabs, takeClosedTab, type ClosedTab } from "./closed-tabs"
import type { SessionTab, Tab } from "./tabs"
import { migrateTabs } from "./tab-migration"
import { isSettingsTabPage, settingsTabHref, settingsTabPages, settingsTabs } from "./settings-tabs"
import { isFixedTab, isKnownTabKey, tabHref, tabKey } from "./tabs"
import type { ServerConnection } from "./server"

const server = "local\nhttp://localhost:4096" as ServerConnection.Key

function sessionTab(sessionId: string): SessionTab {
  return { type: "session", server, sessionId }
}

describe("tab migration", () => {
  test("drops null and malformed persisted tabs", () => {
    expect(
      migrateTabs([null, sessionTab("a"), { type: "session", server }, { type: "unknown", server }, "invalid"], server),
    ).toEqual([sessionTab("a")])
  })

  test("adds the fallback server to valid legacy tabs", () => {
    expect(migrateTabs([{ type: "session", sessionId: "a", dirBase64: "legacy" }], server)).toEqual([sessionTab("a")])
  })

  test("replaces invalid top-level persisted data", () => {
    expect(migrateTabs(null, server)).toEqual([])
    expect(migrateTabs({}, server)).toEqual([])
  })
})

describe("tab memory", () => {
  test("keeps state until its tab is removed", () => {
    createRoot((dispose) => {
      const memory = createTabMemory(getOwner())
      let disposed = 0
      const first = memory.ensure("tab", "prompt", () => {
        onCleanup(() => disposed++)
        return { value: "prompt" }
      })

      expect(memory.ensure("tab", "prompt", () => ({ value: "other" }))).toBe(first)
      expect(memory.get<typeof first>("tab", "prompt")).toBe(first)
      expect(memory.get("missing", "prompt")).toBeUndefined()
      expect(memory.ensure("other", "prompt", () => ({ value: "other" }))).not.toBe(first)

      memory.remove("tab")
      expect(disposed).toBe(1)
      expect(memory.ensure("tab", "prompt", () => ({ value: "new" }))).not.toBe(first)
      dispose()
    })
  })
})

describe("closed tab stack", () => {
  test("records session tabs with their index", () => {
    const stack = pushClosedTab([], sessionTab("a"), 2)

    expect(stack).toEqual([{ tab: sessionTab("a"), index: 2 }])
  })

  test("ignores draft tabs", () => {
    const draft: Tab = { type: "draft", draftID: "d1", server, directory: "/tmp" }

    expect(pushClosedTab([], draft, 0)).toEqual([])
  })

  test("caps the stack size", () => {
    const stack = Array.from({ length: 30 }, (_, i) => i).reduce<ClosedTab[]>(
      (acc, i) => pushClosedTab(acc, sessionTab(`s${i}`), i),
      [],
    )

    expect(stack).toHaveLength(25)
    expect(stack[0]?.tab.sessionId).toBe("s5")
    expect(stack.at(-1)?.tab.sessionId).toBe("s29")
  })

  test("pops the most recently closed tab", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]
    const result = takeClosedTab(stack, [])

    expect(result.entry?.tab.sessionId).toBe("b")
    expect(result.stack).toEqual([{ tab: sessionTab("a"), index: 0 }])
  })

  test("skips entries whose tab is already open", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]
    const result = takeClosedTab(stack, [sessionTab("b")])

    expect(result.entry?.tab.sessionId).toBe("a")
    expect(result.stack).toEqual([])
  })

  test("returns no entry when everything is open or empty", () => {
    expect(takeClosedTab([], []).entry).toBeUndefined()

    const result = takeClosedTab([{ tab: sessionTab("a"), index: 0 }], [sessionTab("a")])
    expect(result.entry).toBeUndefined()
    expect(result.stack).toEqual([])
  })

  test("purges removed sessions", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]

    expect(removeClosedTabs(stack, server, ["a"])).toEqual([{ tab: sessionTab("b"), index: 1 }])
  })

  test("does not navigate when a background tab closes", () => {
    const tabs = [sessionTab("a"), sessionTab("b"), sessionTab("c")]

    expect(nextTabAfterClose(tabs, 1, false)).toBeUndefined()
    expect(nextTabAfterClose(tabs, 1, true)).toEqual(sessionTab("c"))
    expect(nextTabAfterClose([sessionTab("a")], 0, true)).toBeNull()
  })
})

describe("settings tabs", () => {
  test("lists agents, models and settings in order", () => {
    expect(settingsTabPages).toEqual(["agents", "models", "settings"])
    expect(settingsTabs.map((tab) => tab.page)).toEqual(["agents", "models", "settings"])
    expect(settingsTabs.every((tab) => tab.type === "settings")).toBe(true)
  })

  test("builds unique keys and hrefs", () => {
    expect(settingsTabs.map(tabKey)).toEqual(["settings:agents", "settings:models", "settings:settings"])
    expect(settingsTabs.map(tabHref)).toEqual(["/settings/agents", "/settings/models", "/settings/settings"])
    expect(settingsTabHref("agents")).toBe("/settings/agents")
  })

  test("marks only settings tabs as fixed", () => {
    expect(settingsTabs.every(isFixedTab)).toBe(true)
    expect(isFixedTab(sessionTab("a"))).toBe(false)
    expect(isFixedTab({ type: "draft", draftID: "d1", server, directory: "/tmp" })).toBe(false)
  })

  test("validates pages", () => {
    expect(isSettingsTabPage("models")).toBe(true)
    expect(isSettingsTabPage("mcp")).toBe(false)
    expect(isSettingsTabPage(undefined)).toBe(false)
  })

  test("never restores settings tabs from persisted data", () => {
    expect(migrateTabs([{ type: "settings", page: "agents" }, sessionTab("a")], server)).toEqual([sessionTab("a")])
  })

  test("never records settings tabs as closed", () => {
    expect(pushClosedTab([], settingsTabs[0]!, 0)).toEqual([])
  })

  test("picks the neighbour when a tab before the fixed ones is closed", () => {
    const tabs: Tab[] = [sessionTab("a"), sessionTab("b")]
    expect(nextTabAfterClose(tabs, 1, true)).toEqual(sessionTab("a"))
    expect(nextTabAfterClose([sessionTab("a")], 0, true)).toBeNull()
  })
})

describe("known tab keys", () => {
  test("keeps the key of a settings tab", () => {
    expect(isKnownTabKey([], "settings:models")).toBe(true)
    expect(isKnownTabKey([sessionTab("a")], "settings:agents")).toBe(true)
  })

  test("keeps the key of a stored tab and drops unknown keys", () => {
    expect(isKnownTabKey([sessionTab("a")], tabKey(sessionTab("a")))).toBe(true)
    expect(isKnownTabKey([sessionTab("a")], tabKey(sessionTab("b")))).toBe(false)
    expect(isKnownTabKey([], "settings:mcp")).toBe(false)
  })
})
