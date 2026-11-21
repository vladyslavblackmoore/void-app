import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import * as http from "node:http"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app, BrowserWindow } from "electron"

import { Deferred, Effect, Fiber } from "effect"
import contextMenu from "electron-context-menu"

import mainAgent from "../../resources/agents/main.md?raw"
import workerAgent from "../../resources/agents/worker.md?raw"
import architectAgent from "../../resources/agents/architect.md?raw"
import docAgent from "../../resources/agents/doc.md?raw"
import explorerAgent from "../../resources/agents/explorer.md?raw"
import delegateTool from "../../resources/tools/delegate.ts?raw"
import brokerWorkers from "../../resources/broker/workers.json?raw"
import subscriptionWrapper from "../../resources/provider/subscription.mjs?raw"
import mcpMapSource from "../../resources/provider/mcp-map.mjs?raw"
import subscriptionPlugin from "../../resources/plugin/subscription-auth.js?raw"
import subscriptionMcpPlugin from "../../resources/plugin/subscription-mcp.js?raw"
import spaceConfigTemplate from "../../resources/spaces/opencode.jsonc?raw"
import type { ServerReadyData } from "../preload/types"
import { seedAgents } from "./agents"
import { memoryCommand, memoryPluginFile } from "./memory-seed"
import { seedConfig } from "./config-seed"
import { checkAppExists, resolveAppPath } from "./apps"
import { CHANNEL } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { forwardInitializationFailure } from "./initialization"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import {
  finishFirstLaunchOnboarding,
  initializeOldLayoutEligibility,
  isFirstLaunchOnboardingPending,
  isOldLayoutEligible,
} from "./onboarding"
import {
  getDefaultServerUrl,
  preferAppEnv,
  setDefaultServerUrl,
  spawnLocalServer,
} from "./server"
import { setupAutoUpdater, showUpdaterDialog } from "./updater"
import { safeWebContentsURL } from "./window-state"
import {
  getLastFocusedWindow,
  registerRendererProtocol,
  setRelaunchHandler,
  setAppQuitting,
  setBackgroundColor,
  setDockIcon,
  restoreMainWindows,
} from "./windows"
import { createWslServersController } from "./wsl/servers"
import { registerWslIpcHandlers } from "./wsl/ipc"
import { spawnWslSidecar } from "./wsl/sidecar"
import { cleanupStoreFiles } from "./store-cleanup"
import { startBackgroundCli } from "./background-cli"
import { brokerRuntime, withBroker } from "./broker"
import { createBrokerStatus } from "./broker-status"
import { createCores, type Cores, type CoreStart, type CoreStatus } from "./cores"
import { createSpaceService, type SpaceService } from "./space-service"
import { ensureDefaultSpaces, seedSpace, type SpaceSeed } from "./space-defaults"
import { HOME_SPACE_ID, ensureHomeSpace, spaceDir } from "./spaces"
import personalSpaceTemplate from "../../resources/spaces/personal/space.json?raw"
import companySpaceTemplate from "../../resources/spaces/company/space.json?raw"
import { VOID_HOME, voidAppEnv, voidUserData } from "./void-home"
import { setNativeTranslations } from "./native-translations"

const APP_NAMES: Record<string, string> = {
  dev: "VOID",
  beta: "VOID Beta",
  prod: "VOID",
}
const APP_IDS: Record<string, string> = {
  dev: "app.void.desktop.dev",
  beta: "app.void.desktop.beta",
  prod: "app.void.desktop",
}
const TEST_ONBOARDING = process.env.OPENCODE_TEST_ONBOARDING === "1"
const SIDECAR_VERSION = process.env.OPENCODE_SIDECAR_V2 === "1" ? "v2" : "v1"
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

let logger: ReturnType<typeof initLogging>
let cores: Cores | undefined
const brokerStatus = createBrokerStatus()
brokerStatus.subscribe((status) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("broker-status", status)
  }
})
const spaceService = Promise.withResolvers<SpaceService>()
spaceService.promise.catch(() => undefined)

const pendingDeepLinks: string[] = []

function useEnvProxy() {
  try {
    // Electron 41.2 runs Node 24.14.1; latest @types/node@24 is 24.12.2.
    ;(http as any).setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  pendingDeepLinks.push(...urls)
  const win = getLastFocusedWindow()
  if (win) sendDeepLinks(win, urls)
}

async function killSidecar() {
  await cores?.stopAll()
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"]
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => Boolean(value))

    for (const host of loopback) {
      if (items.some((value: string) => value.toLowerCase() === host)) continue
      items.push(host)
    }

    process.env[key] = items.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

const main = Effect.gen(function* () {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

  // on macOS apps run in `/` which can cause issues with ripgrep
  try {
    process.chdir(homedir())
  } catch {}

  process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"

  const appId = app.isPackaged ? APP_IDS[CHANNEL] : "app.void.desktop.dev"
  const onboardingTestRoot = ((): string | undefined => {
    if (!TEST_ONBOARDING) return

    const root = join(tmpdir(), `opencode-onboarding-${randomUUID()}`)
    rmSync(root, { recursive: true, force: true })
    ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
      mkdirSync(join(root, dir), { recursive: true }),
    )
    process.env.OPENCODE_DB = ":memory:"
    process.env.XDG_DATA_HOME = join(root, "data")
    process.env.XDG_CONFIG_HOME = join(root, "config")
    process.env.XDG_CACHE_HOME = join(root, "cache")
    process.env.XDG_STATE_HOME = join(root, "state")
    return root
  })()
  app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "VOID")
  app.setAppUserModelId(appId)
  app.setPath(
    "userData",
    onboardingTestRoot ? join(onboardingTestRoot, "desktop") : voidUserData(app.isPackaged),
  )
  if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))
  initializeOldLayoutEligibility(app.getPath("userData"))
  logger = initLogging()
  initCrashReporter()

  const wslServers = createWslServersController(
    app.getVersion(),
    async (distro) => {
      logger.log("spawning wsl sidecar", { distro })
      return spawnWslSidecar(distro, {
        onLine: (line) => logger.log("wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
    {
      logger: {
        log: (message, meta) => logger.log(message, meta),
        error: (message, meta) => logger.error(message, meta),
      },
    },
  )
  const stopSidecars = async () => {
    await killSidecar()
    wslServers.stopAll()
  }
  const relaunch = () => {
    setAppQuitting()
    void stopSidecars().finally(() => {
      app.relaunch()
      app.quit()
    })
  }
  // The updater starts once the app is ready. Until then nothing can be armed.
  const upgrade = { armed: () => false, stopped: false }

  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }

  logger.log("app starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingTestRoot),
  })

  ensureLoopbackNoProxy()
  useEnvProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)
  if (process.platform === "darwin") app.commandLine.appendSwitch("use-mock-keychain")
  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222")

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  const appRoot = onboardingTestRoot ?? VOID_HOME
  const migrationFailure = yield* Effect.promise(() =>
    ensureHomeSpace(appRoot, new Date(), { log: (message, meta) => logger.log(message, meta) }).then(
      () => undefined,
      (error: unknown) => {
        logger.error("home space migration failed", error)
        return error
      },
    ),
  )
  const shellEnv = preferAppEnv(appRoot)

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("opencode://"))
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    const win = getLastFocusedWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })

  app.on("before-quit", (event) => {
    setAppQuitting()
    const stopping = stopSidecars()
    // An armed OpenCode 2 installer starts the moment the app has quit, and it replaces the files the servers run
    // from. That quit waits, once, until the servers are gone. Every other quit goes on as before.
    if (upgrade.stopped || !upgrade.armed()) return
    event.preventDefault()
    void stopping
      .catch((error) => logger.error("failed to stop servers before the upgrade", error))
      .finally(() => {
        upgrade.stopped = true
        app.quit()
      })
  })

  app.on("will-quit", () => {
    setAppQuitting()
    void stopSidecars()
  })

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: safeWebContentsURL(webContents), details }, "error")
  })

  setRelaunchHandler(() => {
    relaunch()
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      setAppQuitting()
      void stopSidecars().finally(() => app.quit())
    })
  }

  const serverReady = Deferred.makeUnsafe<ServerReadyData, unknown>()

  yield* Effect.promise(() => app.whenReady())

  yield* Effect.promise(() => cleanupStoreFiles(app.getPath("userData"))).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result.deleted.length === 0) return
        logger.log("cleaned scoped store files", { count: result.deleted.length, scanned: result.scanned })
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to clean scoped store files", error)
      }),
    ),
  )
  app.setAsDefaultProtocolClient("opencode")
  registerRendererProtocol()
  setDockIcon()
  const updater = setupAutoUpdater(stopSidecars)
  // macOS is left out: its installer waits for the app to exit by itself, and holding a quit there can cancel a logout.
  upgrade.armed = () => {
    if (process.platform === "darwin") return false
    const status = updater.major.getState().status
    return status === "scheduling" || status === "scheduled"
  }
  const trigger = (id: string) => {
    const win = getLastFocusedWindow()
    if (win) sendMenuCommand(win, id)
  }
  const showUpdater = () =>
    showUpdaterDialog(updater, true, () => {
      if (BrowserWindow.getAllWindows().length > 0) return trigger("update.open")
      // macOS keeps running with every window closed. A new window asks the updater as it starts, and opens the offer.
      updater.major.ask()
      restoreMainWindows()
    })
  const menuDeps = {
    trigger,
    checkForUpdates: () => void showUpdater(),
    relaunch,
  }
  registerIpcHandlers({
    killSidecar: () => killSidecar(),
    relaunch,
    awaitInitialization: Effect.fnUntraced(
      function* () {
        logger.log("awaiting server ready")
        const res = yield* Deferred.await(serverReady)
        logger.log("server ready", { url: res.url })
        return res
      },
      (e) => Effect.runPromise(e),
    ),
    consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    isFirstLaunchOnboardingPending,
    finishFirstLaunchOnboarding,
    isOldLayoutEligible,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => undefined,
    checkAppExists: (appName) => checkAppExists(appName),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    updater,
    showUpdater,
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error) => writeLog("renderer", "fatal renderer error", { ...error }, "error"),
    getBrokerStatus: (space) => brokerStatus.get(space),
    spaces: {
      list: async () => (await spaceService.promise).list(),
      start: async (id) => (await spaceService.promise).start(id),
      getViewed: async () => (await spaceService.promise).getViewed(),
      setViewed: async (id, window) => (await spaceService.promise).setViewed(id, window),
      closeWindow: (window) => void spaceService.promise.then((service) => service.closeWindow(window), () => undefined),
    },
    setNativeTranslations: (bundle) => {
      if (setNativeTranslations(bundle)) createMenu(menuDeps)
    },
  })
  registerWslIpcHandlers(wslServers)
  void updater.start()
  const updateTimer = setInterval(() => void updater.check(), 10 * 60 * 1000)
  updateTimer.unref()
  app.once("will-quit", () => clearInterval(updateTimer))
  yield* Effect.promise(() => startNetLog()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to start net log", error)
      }),
    ),
  )

  const loadingTask = yield* Effect.gen(function* () {
    logger.log("sidecar connection started", { version: SIDECAR_VERSION })
    if (migrationFailure !== undefined) {
      spaceService.reject(migrationFailure)
      return yield* Effect.fail(migrationFailure)
    }

    const memorySourceDir = join(dirname(fileURLToPath(import.meta.url)), "../../../void-memory")
    const seed: SpaceSeed = {
      agents: [
        { name: "main", content: mainAgent },
        { name: "worker", content: workerAgent },
        { name: "architect", content: architectAgent, version: 2 },
        { name: "doc", content: docAgent, version: 2 },
        { name: "explorer", content: explorerAgent, version: 2 },
      ],
      wrapper: subscriptionWrapper,
      plugin: subscriptionPlugin,
      mcpPlugin: subscriptionMcpPlugin,
      mcpMap: mcpMapSource,
      config: spaceConfigTemplate,
      memory: memoryCommand({
        packaged: app.isPackaged,
        sourceDir: memorySourceDir,
        resourcesPath: process.resourcesPath,
        execPath: process.execPath,
      }),
      memoryPlugin: memoryPluginFile({
        packaged: app.isPackaged,
        sourceDir: memorySourceDir,
        resourcesPath: process.resourcesPath,
      }),
      tools: [{ name: "delegate", content: delegateTool }],
      workers: brokerWorkers,
    }
    yield* Effect.promise(() =>
      ensureDefaultSpaces(
        appRoot,
        { personal: JSON.parse(personalSpaceTemplate), company: JSON.parse(companySpaceTemplate) },
        onboardingTestRoot ? join(onboardingTestRoot, "no-old-runtime") : join(homedir(), ".void", "spaces"),
      ).catch((error) => logger.warn("failed to create default spaces", error)),
    )
    const brokerRuntimeChoice = brokerRuntime({
      packaged: app.isPackaged,
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      devEntry: join(dirname(fileURLToPath(import.meta.url)), "../../../void-broker/src/main.ts"),
      env: process.env,
    })
    const startCore: CoreStart = async (id, options) => {
      let exitSignal!: () => void
      const exited = new Promise<void>((resolve) => {
        exitSignal = resolve
      })
      const { listener, health } = await spawnLocalServer(options.hostname, options.port, options.password, {
        userDataPath: join(spaceDir(appRoot, id), "state"),
        env: options.env,
        onStdout: (message) => writeLog("server", "stdout", { message, space: id }),
        onStderr: (message) => writeLog("server", "stderr", { message, space: id }, "warn"),
        onExit: (code) => {
          writeLog("utility", "sidecar exited", { code, space: id }, "warn")
          exitSignal()
        },
      })
      return { stop: listener.stop, ready: health.wait, exited }
    }
    const spaces = createCores({
      root: appRoot,
      onStatus: (event: CoreStatus) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send("spaces-core-status", event)
        }
      },
      prepare: (id) => seedSpace(appRoot, id, seed).catch((error) => logger.warn("failed to seed space", error)),
      start: withBroker(startCore, {
        root: appRoot,
        runtime: brokerRuntimeChoice,
        status: brokerStatus,
        warn: (message, error) => logger.warn(message, error),
      }),
    })
    cores = spaces
    const service = createSpaceService({ root: appRoot, cores: spaces })
    spaceService.resolve(service)

    ensureLoopbackNoProxy()
    useEnvProxy()

    if (SIDECAR_VERSION === "v2") {
      logger.log("spawning v2 sidecar")
      yield* Effect.promise(() => seedSpace(appRoot, HOME_SPACE_ID, seed).catch((error) => logger.warn("failed to seed space", error)))
      const sidecar = yield* Effect.promise(() => startBackgroundCli(logger, shellEnv?.XDG_STATE_HOME))
      yield* Deferred.succeed(serverReady, {
        url: sidecar.url,
        username: sidecar.username,
        password: sidecar.password,
      })

      if (process.platform === "win32") {
        void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
      }

      logger.log("loading task finished")
      return
    }

    const fromEnv = Number.parseInt(process.env.OPENCODE_PORT ?? "", 10)
    logger.log("spawning sidecar")
    const core = yield* Effect.promise(() =>
      spaces.ensure(HOME_SPACE_ID, Number.isNaN(fromEnv) ? {} : { port: fromEnv }),
    )
    yield* Deferred.succeed(serverReady, {
      url: core.url,
      username: core.username,
      password: core.password,
    })

    if (process.platform === "win32") {
      void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
    }

    yield* Effect.promise(() => spaces.ready(HOME_SPACE_ID)).pipe(
      Effect.timeout("30 seconds"),
      Effect.catch((e) =>
        Effect.sync(() => {
          logger.error("sidecar health check failed", e.toString())
        }),
      ),
    )

    logger.log("loading task finished")
  }).pipe(forwardInitializationFailure(serverReady), Effect.forkChild)

  yield* Fiber.await(loadingTask)

  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return
    app.quit()
  })
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    restoreMainWindows()
  })

  const windows = restoreMainWindows()
  if (windows.length) createMenu(menuDeps)
})

Effect.runFork(main)
