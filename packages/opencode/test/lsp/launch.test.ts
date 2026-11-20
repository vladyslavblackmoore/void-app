import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { text } from "node:stream/consumers"
import { spawn } from "../../src/lsp/launch"
import { tmpdir } from "../fixture/fixture"

describe("lsp.launch", () => {
  test("spawns cmd scripts with spaces on Windows", async () => {
    if (process.platform !== "win32") return

    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, "with space")
    const file = path.join(dir, "echo cmd.cmd")

    await fs.mkdir(dir, { recursive: true })
    await Bun.write(file, "@echo off\r\nif %~1==--stdio exit /b 0\r\nexit /b 7\r\n")

    const proc = spawn(file, ["--stdio"])

    expect(await proc.exited).toBe(0)
  })

  test("gives servers the user's own xdg dirs", async () => {
    if (process.platform === "win32") return

    const keys = [
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "VOID_USER_ENV",
      "OPENCODE_SERVER_USERNAME",
      "OPENCODE_SERVER_PASSWORD",
    ]
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    Object.assign(process.env, {
      XDG_CONFIG_HOME: "/home/u/.config/void",
      XDG_DATA_HOME: "/home/u/.local/share/void",
      VOID_USER_ENV: JSON.stringify({ XDG_CONFIG_HOME: "/home/u/.config", XDG_DATA_HOME: null }),
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: "test-password",
    })
    try {
      const proc = spawn("/usr/bin/env", { env: { LSP_PROBE: "1" } })
      const out = await text(proc.stdout)
      expect(await proc.exited).toBe(0)
      const lines = out
        .split("\n")
        .filter((line) => /^(XDG_CONFIG_HOME|XDG_DATA_HOME|VOID_USER_|OPENCODE_SERVER_|LSP_PROBE)/.test(line))
        .sort()
      expect(lines).toEqual(["LSP_PROBE=1", "XDG_CONFIG_HOME=/home/u/.config"])
    } finally {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key]
        else process.env[key] = prev[key]
      }
    }
  })
})
