import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

const provider = "subscription"
const binary = join(homedir(), ".local", "bin", "claude")
const configDir = join(homedir(), "void", "claude")
const loginLimit = 10 * 60 * 1000
const statusLimit = 15 * 1000
const markerWindow = 30 * 1000
const statusTtl = 3 * 1000
const passEnv = ["HOME", "USER", "LOGNAME", "PATH", "SHELL", "LANG", "LC_ALL", "TMPDIR"]

let login
let markerDueUntil = 0
let statusCache

function cliEnv() {
  const env = Object.fromEntries(passEnv.filter((key) => process.env[key]).map((key) => [key, process.env[key]]))
  return { ...env, CLAUDE_CONFIG_DIR: configDir }
}

function run(args, limit) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { env: cliEnv(), stdio: ["ignore", "pipe", "ignore"] })
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

async function readStatus() {
  const { out } = await run(["auth", "status", "--json"], statusLimit)
  try {
    return JSON.parse(out).loggedIn === true
  } catch {
    return false
  }
}

function signedIn() {
  const now = Date.now()
  if (statusCache && now - statusCache.at < statusTtl) return statusCache.value
  const value = readStatus()
  statusCache = { at: now, value }
  return value
}

async function connected(auth) {
  if (auth) markerDueUntil = 0
  if (!(await signedIn())) return false
  if (auth) return true
  if (login || Date.now() < markerDueUntil) return true
  await run(["auth", "logout"], statusLimit)
  statusCache = undefined
  return false
}

function startLogin() {
  if (login) login.child.kill()
  const child = spawn(binary, ["auth", "login", "--claudeai"], {
    env: cliEnv(),
    stdio: ["pipe", "ignore", "ignore"],
  })
  const done = new Promise((resolve) => {
    child.on("error", () => resolve(-1))
    child.on("exit", (code) => resolve(code ?? -1))
  })
  const timer = setTimeout(() => child.kill(), loginLimit)
  const current = { child, done }
  login = current
  done.then((code) => {
    clearTimeout(timer)
    statusCache = undefined
    if (code === 0) markerDueUntil = Date.now() + markerWindow
    if (login === current) login = undefined
  })
  return current
}

async function finish(current) {
  const code = await current.done
  if (code !== 0) return { type: "failed" }
  if (!(await signedIn())) return { type: "failed" }
  return { type: "success", key: provider, metadata: { configDir } }
}

export default {
  id: "void.subscription-auth",
  server: async () => ({
    auth: {
      provider,
      connected,
      methods: [
        {
          type: "oauth",
          label: "Sign in with your subscription",
          authorize: async () => {
            const current = startLogin()
            return {
              url: "https://claude.ai/login",
              method: "auto",
              instructions: "The sign-in page opened in your browser",
              callback: () => finish(current),
            }
          },
        },
      ],
    },
  }),
}
