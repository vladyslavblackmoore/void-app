import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createCores, type CoreStart } from "./cores"
import { createSpaceService } from "./space-service"
import { createSpace, ensureHomeSpace } from "./spaces"
import { readViewedSpace } from "./space-state"

let root: string
let started: string[]
let busy: Record<string, boolean>

const start: CoreStart = async (id) => {
  started.push(id)
  return { stop: async () => undefined }
}

function make() {
  let port = 5000
  const ports = new Map<string, string>()
  const fetcher = async (input: string | URL) => {
    const url = new URL(input)
    const id = [...ports.entries()].find(([, value]) => value === url.port)?.[0]
    if (url.pathname === "/project") return Response.json([{ worktree: "/a", sandboxes: [] }])
    if (url.pathname === "/session/status") return Response.json(id && busy[id] ? { s1: { type: "busy" } } : {})
    return new Response("?", { status: 404 })
  }
  const cores = createCores({
    root,
    start,
    user: () => ({}),
    freePort: async () => port++,
    password: () => "pw",
    fetch: fetcher,
    every: () => () => undefined,
  })
  const ensure = cores.ensure
  cores.ensure = async (id, options) => {
    const endpoint = await ensure(id, options)
    ports.set(id, new URL(endpoint.url).port)
    return endpoint
  }
  return { cores, service: createSpaceService({ root, cores, fetch: fetcher }) }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "void-space-service-"))
  started = []
  busy = {}
  await ensureHomeSpace(root)
  await createSpace(root, { id: "void", name: "VOID", class: "personal", sessionMode: "isolated", color: "#7c5cff" })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("space service", () => {
  test("lists names, colours and running state without endpoints", async () => {
    const { service } = make()
    const list = await service.list()
    expect(list.map((item) => item.id)).toEqual(["home", "void"])
    expect(list[1]).toEqual({ id: "void", name: "VOID", color: "#7c5cff", class: "personal", running: false, busy: false })
    expect(JSON.stringify(list)).not.toContain("pw")
  })

  test("marks a running core and a core with a running session", async () => {
    const { service } = make()
    await service.start("home")
    await service.start("void")
    busy.home = true
    const list = await service.list()
    expect(list.find((item) => item.id === "home")).toMatchObject({ running: true, busy: true })
    expect(list.find((item) => item.id === "void")).toMatchObject({ running: true, busy: false })
  })

  test("starts a space core and returns its endpoint", async () => {
    const { service } = make()
    const endpoint = await service.start("void")
    expect(endpoint).toMatchObject({ username: "opencode", password: "pw" })
    expect(endpoint.url.startsWith("http://127.0.0.1:")).toBe(true)
    expect(started).toEqual(["void"])
  })

  test("refuses to start an unknown space", async () => {
    const { service } = make()
    await expect(service.start("nope")).rejects.toThrow()
    await expect(service.start("../x")).rejects.toThrow()
    expect(started).toEqual([])
  })

  test("sets the viewed space, persists it and keeps the previous core running", async () => {
    const { service, cores } = make()
    await service.start("home")
    await service.setViewed("home")
    await service.start("void")
    await service.setViewed("void")
    expect(await service.getViewed()).toBe("void")
    expect(await readViewedSpace(root)).toBe("void")
    expect(cores.viewed()).toBe("void")
    expect(cores.running().sort()).toEqual(["home", "void"])
  })

  test("falls back to home when the saved space is gone", async () => {
    const { service } = make()
    await service.setViewed("void")
    await rm(join(root, "spaces", "void"), { recursive: true, force: true })
    expect(await service.getViewed()).toBe("home")
  })

  test("rejects viewing an unknown space", async () => {
    const { service } = make()
    await expect(service.setViewed("nope")).rejects.toThrow()
    expect(await readViewedSpace(root)).toBeUndefined()
  })
})
