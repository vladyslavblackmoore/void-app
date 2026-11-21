import { describe, expect, test } from "bun:test"
import { mapMcpServers, mcpSanitize } from "../../resources/provider/mcp-map.mjs"

describe("mapMcpServers", () => {
  test("maps a local entry to stdio with command, args and env", () => {
    expect(
      mapMcpServers({ files: { type: "local", command: ["node", "srv.js", "--x"], environment: { A: "1" } } }),
    ).toEqual({ files: { type: "stdio", command: "node", args: ["srv.js", "--x"], env: { A: "1" } } })
  })

  test("omits env when the entry has no environment", () => {
    expect(mapMcpServers({ files: { type: "local", command: ["node"] } })).toEqual({
      files: { type: "stdio", command: "node", args: [] },
    })
  })

  test("maps a remote entry to http with url and headers", () => {
    expect(mapMcpServers({ hub: { type: "remote", url: "https://h.example/mcp", headers: { X: "y" } } })).toEqual({
      hub: { type: "http", url: "https://h.example/mcp", headers: { X: "y" } },
    })
    expect(mapMcpServers({ hub: { type: "remote", url: "https://h.example/mcp" } })).toEqual({
      hub: { type: "http", url: "https://h.example/mcp" },
    })
  })

  test("skips disabled entries", () => {
    expect(mapMcpServers({ off: { type: "local", command: ["x"], enabled: false } })).toEqual({})
  })

  test("skips entries that reference secrets", () => {
    const servers = mapMcpServers({
      a: { type: "local", command: ["x"], environment: { K: "secret:key" } },
      b: { type: "local", command: ["secret:bin"] },
      c: { type: "remote", url: "https://h", headers: { Authorization: "secret:token" } },
      d: { type: "local", command: ["ok"] },
    })
    expect(Object.keys(servers)).toEqual(["d"])
  })

  test("skips malformed entries and tolerates a missing block", () => {
    expect(mapMcpServers({ a: null, b: { type: "local", command: [] }, c: { type: "remote" }, d: { type: "other" } })).toEqual({})
    expect(mapMcpServers(undefined)).toEqual({})
    expect(mapMcpServers("x")).toEqual({})
  })

  test("drops servers whose sanitized names would make tool names ambiguous", () => {
    const servers = mapMcpServers({
      "a.b": { type: "local", command: ["x"] },
      a_b: { type: "local", command: ["y"] },
      other: { type: "local", command: ["z"] },
    })
    expect(Object.keys(servers)).toEqual(["other"])
  })

  test("sanitizes names", () => {
    expect(mcpSanitize("my server.v2")).toBe("my_server_v2")
  })
})
