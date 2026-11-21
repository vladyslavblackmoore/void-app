import { describe, expect, test } from "bun:test"
import type { SpacesPlatform } from "@opencode-ai/app/spaces/types"
import { loadViewedSpace, startupServerKey } from "./spaces"

const endpoint = { url: "http://127.0.0.1:9", username: "opencode", password: "pw" }

function api(viewed: string, calls: string[] = []): SpacesPlatform {
  return {
    list: async () => [
      { id: "home", name: "Home", color: "#111111", class: "personal", running: true, busy: false },
      { id: "void", name: "VOID", color: "#222222", class: "personal", running: false, busy: false },
    ],
    start: async (id) => {
      calls.push(`start:${id}`)
      return endpoint
    },
    getViewed: async () => viewed,
    setViewed: async (id) => {
      calls.push(`viewed:${id}`)
      return endpoint
    },
  }
}

describe("loadViewedSpace", () => {
  test("registers home as viewed and returns no connection", async () => {
    const calls: string[] = []
    expect(await loadViewedSpace(api("home", calls))).toBeUndefined()
    expect(calls).toEqual(["viewed:home"])
  })

  test("registers the viewed space with the window and describes it as a connection", async () => {
    const calls: string[] = []
    const conn = await loadViewedSpace(api("void", calls))
    expect(calls).toEqual(["viewed:void"])
    expect(conn).toMatchObject({ type: "sidecar", space: "void", displayName: "VOID", http: { password: "pw" } })
  })

  test("falls back to home when the space is unknown or fails to start", async () => {
    const calls: string[] = []
    expect(await loadViewedSpace(api("gone", calls))).toBeUndefined()
    expect(calls).toEqual(["viewed:home"])
    const failing = { ...api("void", calls), setViewed: async (id: string) => (id === "void" ? Promise.reject(new Error("no")) : endpoint) }
    expect(await loadViewedSpace(failing)).toBeUndefined()
  })
})

describe("startupServerKey", () => {
  const conn = { type: "sidecar", variant: "base", space: "void", http: { url: "x" } } as const

  test("prefers an explicit default server", () => {
    expect(startupServerKey("http://remote", conn)).toBe("http://remote")
  })

  test("uses the viewed space without an explicit default", () => {
    expect(startupServerKey(null, conn)).toBe("sidecar:void")
    expect(startupServerKey(undefined, undefined)).toBe("sidecar")
  })
})
