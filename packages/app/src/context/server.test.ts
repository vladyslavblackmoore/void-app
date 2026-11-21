import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import {
  createServerProjects,
  migrateCanonicalLocalServerState,
  nextServerAfterRemoval,
  resolveServerList,
  ServerConnection,
  serversForActive,
} from "./server"
import { ServerScope } from "@/utils/server-scope"

describe("resolveServerList", () => {
  test("lets startup auth_token credentials override a persisted same-url server", () => {
    const list = resolveServerList({
      stored: [{ url: "https://server.example.test" }],
      props: [
        {
          type: "http",
          authToken: true,
          http: {
            url: "https://server.example.test",
            username: "opencode",
            password: "secret",
          },
        },
      ],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "opencode",
      password: "secret",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : false).toBe(true)
    expect(ServerConnection.key(list[0]!) as string).toBe("https://server.example.test")
  })

  test("keeps persisted credentials when startup has no auth_token", () => {
    const list = resolveServerList({
      stored: [
        {
          url: "https://server.example.test",
          username: "opencode",
          password: "saved",
        },
      ],
      props: [{ type: "http", http: { url: "https://server.example.test" } }],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "opencode",
      password: "saved",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : true).toBeUndefined()
  })
})

test("treats WSL sidecars as remote server connections", () => {
  expect(
    ServerConnection.local({
      type: "sidecar",
      variant: "wsl",
      distro: "Debian",
      http: { url: "http://127.0.0.1:4097" },
    }),
  ).toBe(false)
  expect(ServerConnection.local({ type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4096" } })).toBe(
    true,
  )
  expect(ServerConnection.local({ type: "http", http: { url: "http://localhost:4096" } })).toBe(true)
  expect(ServerConnection.local({ type: "http", http: { url: "https://server.example.test" } })).toBe(false)
})

test("active server removal falls back across built-in and persisted servers", () => {
  const local = { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:4096" } } as const
  const debian = {
    type: "sidecar",
    variant: "wsl",
    distro: "Debian",
    http: { url: "http://127.0.0.1:4097" },
  } as const

  expect(
    nextServerAfterRemoval(
      [local, debian],
      ServerConnection.Key.make("wsl:Debian"),
      ServerConnection.Key.make("sidecar"),
    ),
  ).toBe(ServerConnection.Key.make("sidecar"))
})

describe("createServerProjects", () => {
  test("keeps active and explicit server buckets in one reactive store", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const active = createServerProjects({ scope, store, setStore })
      const remote = createServerProjects({ scope: () => "https://debian.example" as ServerScope, store, setStore })

      remote.open("/repo")
      expect(remote.list()).toEqual([{ worktree: "/repo", expanded: true }])
      expect(active.list()).toEqual([])

      const adopted = createServerProjects({ scope: () => "https://debian.example" as ServerScope, store, setStore })
      expect(adopted.list()).toEqual([{ worktree: "/repo", expanded: true }])

      adopted.close("/repo")
      expect(remote.list()).toEqual([])
      dispose()
    })
  })

  test("tracks recently closed projects and drops them when reopened", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      projects.open("/a")
      projects.open("/b")
      projects.close("/a")
      expect(projects.recentlyClosed()).toEqual(["/a"])

      projects.close("/b")
      expect(projects.recentlyClosed()).toEqual(["/b", "/a"])

      projects.open("/a")
      expect(projects.recentlyClosed()).toEqual(["/b"])
      expect(projects.list()).toEqual([{ worktree: "/a", expanded: true }])
      dispose()
    })
  })

  test("remove drops a project without recording it as recently closed", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      projects.open("/repo/subdir")
      projects.remove("/repo/subdir")
      expect(projects.list()).toEqual([])
      expect(projects.recentlyClosed()).toEqual([])
      dispose()
    })
  })

  test("retains recently closed history beyond the visible display limit", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      // Closing 6 projects keeps all 6 in the store even though only 5 are displayed;
      // this prevents display-filtered entries from evicting still-visible ones.
      for (const dir of ["/1", "/2", "/3", "/4", "/5", "/6"]) {
        projects.open(dir)
        projects.close(dir)
      }
      expect(projects.recentlyClosed()).toEqual(["/6", "/5", "/4", "/3", "/2", "/1"])
      dispose()
    })
  })

  test("caps recently closed history at the store limit", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      for (let i = 1; i <= 20; i++) {
        projects.open(`/p${i}`)
        projects.close(`/p${i}`)
      }
      expect(projects.recentlyClosed()).toHaveLength(16)
      expect(projects.recentlyClosed()[0]).toBe("/p20")
      expect(projects.recentlyClosed().at(-1)).toBe("/p5")
      dispose()
    })
  })

  test("dedupes recently closed entries by normalized path", () => {
    createRoot((dispose) => {
      const [scope] = createSignal(ServerScope.local)
      const [store, setStore] = createStore({ projects: {}, lastProject: {}, recentlyClosed: {} })
      const projects = createServerProjects({ scope, store, setStore })

      projects.close("/repo")
      projects.close("/repo/")
      expect(projects.recentlyClosed()).toEqual(["/repo/"])
      dispose()
    })
  })
})

describe("migrateCanonicalLocalServerState", () => {
  test("moves an existing canonical web bucket into local scope", () => {
    expect(
      migrateCanonicalLocalServerState(
        {
          list: [],
          projects: { "https://opencode.example.com": [{ worktree: "/remote", expanded: true }] },
          lastProject: { "https://opencode.example.com": "/remote" },
        },
        ServerConnection.Key.make("https://opencode.example.com"),
      ),
    ).toEqual({
      list: [],
      projects: { local: [{ worktree: "/remote", expanded: true }] },
      lastProject: { local: "/remote" },
    })
  })

  test("preserves existing local state while merging a canonical web bucket", () => {
    expect(
      migrateCanonicalLocalServerState(
        {
          projects: {
            local: [{ worktree: "/local", expanded: false }],
            "https://opencode.example.com": [
              { worktree: "/local", expanded: true },
              { worktree: "/remote", expanded: true },
            ],
          },
          lastProject: { local: "/local", "https://opencode.example.com": "/remote" },
        },
        ServerConnection.Key.make("https://opencode.example.com"),
      ),
    ).toEqual({
      projects: {
        local: [
          { worktree: "/local", expanded: false },
          { worktree: "/remote", expanded: true },
        ],
      },
      lastProject: { local: "/local" },
    })
  })
})

describe("space connections", () => {
  const sidecar = (space?: string, url = "http://127.0.0.1:1"): ServerConnection.Any => ({
    type: "sidecar",
    variant: "base",
    ...(space === undefined ? {} : { space }),
    http: { url, username: "opencode", password: "pw" },
  })

  test("keeps the legacy key for the home core and a key per other space", () => {
    expect(ServerConnection.key(sidecar()) as string).toBe("sidecar")
    expect(ServerConnection.key(sidecar("home")) as string).toBe("sidecar")
    expect(ServerConnection.key(sidecar("void")) as string).toBe("sidecar:void")
    expect(ServerConnection.key(sidecar("work")) as string).toBe("sidecar:work")
  })

  test("gives every space its own project scope and keeps home on the local scope", () => {
    const scope = (conn: ServerConnection.Any) => String(ServerScope.fromServerKey(ServerConnection.key(conn)))
    expect(scope(sidecar())).toBe("local")
    expect(scope(sidecar("void"))).toBe("sidecar:void")
    expect(scope(sidecar("void"))).not.toBe(scope(sidecar("work")))
  })

  test("treats every space core as the builtin local server", () => {
    expect(ServerConnection.builtin(sidecar("void"))).toBe(true)
    expect(ServerConnection.local(sidecar("void"))).toBe(true)
  })

  test("lists one connection per space and lets a restarted core replace its endpoint", () => {
    const list = resolveServerList({
      stored: [],
      props: [sidecar(), sidecar("void", "http://127.0.0.1:2"), sidecar("void", "http://127.0.0.1:3")],
    })
    expect(list.map((item) => ServerConnection.key(item) as string)).toEqual(["sidecar", "sidecar:void"])
    expect(list[1]?.http.url).toBe("http://127.0.0.1:3")
  })

  test("reads the space id of a connection", () => {
    expect(ServerConnection.space(sidecar())).toBe("home")
    expect(ServerConnection.space(sidecar("void"))).toBe("void")
    expect(ServerConnection.space({ type: "http", http: { url: "http://x" } })).toBeUndefined()
  })
})

describe("serversForActive", () => {
  const sidecar = (space?: string, name = space ?? "Core server"): ServerConnection.Any => ({
    type: "sidecar",
    variant: "base",
    space,
    displayName: name,
    http: { url: `http://127.0.0.1:${space ? 5000 + space.length : 4000}` },
  })
  const remote: ServerConnection.Any = { type: "http", http: { url: "https://remote.example.test" } }
  const list = [sidecar(), sidecar("void", "VOID"), sidecar("sharkscode", "Work"), remote]
  const keys = (items: ServerConnection.Any[]) => items.map((item) => ServerConnection.key(item) as string)

  test("shows only the active space among the space cores", () => {
    expect(keys(serversForActive(list, ServerConnection.Key.make("sidecar:void")))).toEqual([
      "sidecar:void",
      "https://remote.example.test",
    ])
    expect(keys(serversForActive(list, ServerConnection.Key.make("sidecar")))).toEqual([
      "sidecar",
      "https://remote.example.test",
    ])
  })

  test("keeps every server when the active one is not a space core", () => {
    expect(serversForActive(list, ServerConnection.Key.make("https://remote.example.test"))).toEqual(list)
  })
})
