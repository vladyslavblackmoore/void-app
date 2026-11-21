import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

const provider = "subscription"
const loginLimit = 10 * 60 * 1000
const statusLimit = 15 * 1000
const markerWindow = 30 * 1000
const statusTtl = 3 * 1000
const passEnv = ["HOME", "USER", "LOGNAME", "PATH", "SHELL", "LANG", "LC_ALL", "TMPDIR"]

let login
let markerDueUntil = 0
let markerSeen = false
let statusCache
let exitHooked = false

function cliSettings(options) {
  return {
    binary: options?.binary ?? join(homedir(), ".local", "bin", "claude"),
    configDir: options?.configDir || process.env.VOID_SPACE_CLI_DIR || undefined,
  }
}

function cliEnv(cli) {
  const env = Object.fromEntries(passEnv.filter((key) => process.env[key]).map((key) => [key, process.env[key]]))
  return cli.configDir ? { ...env, CLAUDE_CONFIG_DIR: cli.configDir } : env
}

function run(cli, args, limit) {
  return new Promise((resolve) => {
    const child = spawn(cli.binary, args, { env: cliEnv(cli), stdio: ["ignore", "pipe", "ignore"] })
    let out = ""
    child.stdout.on("data", (chunk) => {
      if (out.length < 65536) out += chunk
    })
    const timer = setTimeout(() => child.kill(), limit)
    child.on("error", () => {
      clearTimeout(timer)
      resolve({ code: -1, out: "" })
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out })
    })
  })
}

async function readStatus(cli) {
  const { out } = await run(cli, ["auth", "status", "--json"], statusLimit)
  try {
    return JSON.parse(out).loggedIn === true
  } catch {
    return false
  }
}

function signedIn(cli) {
  const now = Date.now()
  if (statusCache && now - statusCache.at < statusTtl) return statusCache.value
  const value = readStatus(cli)
  statusCache = { at: now, value }
  return value
}

async function connected(cli, auth) {
  if (auth) {
    markerDueUntil = 0
    markerSeen = true
  }
  if (!(await signedIn(cli))) return false
  if (auth) return true
  if (login || Date.now() < markerDueUntil) return true
  if (!markerSeen) return false
  markerSeen = false
  if (cli.configDir) await run(cli, ["auth", "logout"], statusLimit)
  statusCache = undefined
  return false
}

function stopLogin() {
  login?.child.kill()
}

function startLogin(cli, owned) {
  stopLogin()
  if (!exitHooked) {
    exitHooked = true
    process.once("exit", stopLogin)
  }
  const child = spawn(cli.binary, ["auth", "login", "--claudeai"], {
    env: cliEnv(cli),
    stdio: ["pipe", "ignore", "ignore"],
  })
  const done = new Promise((resolve) => {
    child.on("error", () => resolve(-1))
    child.on("exit", (code) => resolve(code ?? -1))
  })
  const timer = setTimeout(() => child.kill(), loginLimit)
  const current = { child, done }
  login = current
  owned.add(current)
  done.then((code) => {
    clearTimeout(timer)
    owned.delete(current)
    statusCache = undefined
    if (code === 0) markerDueUntil = Date.now() + markerWindow
    if (login === current) login = undefined
  })
  return current
}

async function finish(cli, current) {
  const code = await current.done
  if (code !== 0) return { type: "failed" }
  if (!(await signedIn(cli))) return { type: "failed" }
  return { type: "success", key: provider, metadata: cli.configDir ? { configDir: cli.configDir } : { userDefault: true } }
}

export default {
  id: "void.subscription-auth",
  server: async (_input, options) => {
    const cli = cliSettings(options)
    const owned = new Set()
    return {
      auth: {
        provider,
        connected: (auth) => connected(cli, auth),
        methods: [
          {
            type: "oauth",
            label: "Sign in with your subscription",
            authorize: async () => {
              const current = startLogin(cli, owned)
              return {
                url: "https://claude.ai/login",
                method: "auto",
                instructions: "The sign-in page opened in your browser",
                callback: () => finish(cli, current),
              }
            },
          },
        ],
      },
      dispose: async () => {
        for (const current of owned) current.child.kill()
        owned.clear()
      },
    }
  },
}
