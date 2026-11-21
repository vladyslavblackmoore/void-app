import { PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk"
import type {
  Agent,
  AgentSideConnection,
  InitializeResponse,
  LoadSessionRequest,
  McpServer,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  SessionUpdate,
} from "@agentclientprotocol/sdk"
import { randomUUID } from "node:crypto"
import { binaryArgs, type ShimOptions } from "./args"
import { spawnBinary, type BinaryProcess } from "./binary"
import type { BinaryEvent } from "./events"
import type { ConfigStore } from "./mcp"

type Turn = {
  resolve: (response: PromptResponse) => void
  reject: (error: Error) => void
  cancelled: boolean
}

export class ShimAgent implements Agent {
  private sessionId: string | undefined
  private cwd = ""
  private configFile = ""
  private proc: BinaryProcess | undefined
  private generation = 0
  private signalled = false
  private turn: Turn | undefined
  private updates: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | undefined
  private interrupts = 0
  private interruptId = ""

  constructor(
    private readonly connection: AgentSideConnection,
    private readonly options: ShimOptions,
    private readonly store: ConfigStore,
  ) {}

  initialize(): InitializeResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true, mcpCapabilities: { http: true } },
      authMethods: [],
    }
  }

  authenticate() {
    return {}
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = randomUUID()
    await this.begin(sessionId, params.cwd, params.mcpServers, false)
    return { sessionId }
  }

  async loadSession(params: LoadSessionRequest) {
    await this.begin(params.sessionId, params.cwd, params.mcpServers, true)
    return {}
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    if (!this.sessionId || params.sessionId !== this.sessionId) throw RequestError.invalidParams(undefined, "unknown session")
    if (this.turn) throw RequestError.invalidRequest(undefined, "a prompt is already running")
    const text = params.prompt.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n")
    const turn: Turn = { resolve: () => undefined, reject: () => undefined, cancelled: false }
    const done = new Promise<PromptResponse>((resolve, reject) => {
      turn.resolve = resolve
      turn.reject = reject
    })
    this.turn = turn
    try {
      if (!this.proc || this.signalled) await this.spawn(true)
      if (turn.cancelled) this.finish((item) => item.resolve({ stopReason: "cancelled" }))
      else this.proc?.write({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null })
    } catch (error) {
      this.turn = undefined
      throw error
    }
    return done
  }

  cancel(params: { sessionId: string }) {
    const turn = this.turn
    if (!turn || params.sessionId !== this.sessionId) return
    turn.cancelled = true
    const proc = this.proc
    if (!proc) return
    this.interruptId = `interrupt-${++this.interrupts}`
    proc.write({ type: "control_request", request_id: this.interruptId, request: { subtype: "interrupt" } })
    this.timer = setTimeout(() => {
      this.signalled = true
      proc.signal("SIGINT")
    }, this.options.interruptTimeoutMs)
  }

  async close() {
    clearTimeout(this.timer)
    this.generation += 1
    this.proc?.kill()
    this.proc = undefined
    await this.store.dispose()
  }

  private async begin(sessionId: string, cwd: string, servers: McpServer[], resume: boolean) {
    if (this.sessionId) throw RequestError.invalidRequest(undefined, "this shim already holds a session")
    this.configFile = await this.store.write(servers)
    this.sessionId = sessionId
    this.cwd = cwd
    try {
      await this.spawn(resume)
    } catch (error) {
      this.sessionId = undefined
      throw error
    }
  }

  private async spawn(resume: boolean) {
    this.proc?.kill()
    this.signalled = false
    const generation = ++this.generation
    const env = this.options.configDir ? { ...process.env, CLAUDE_CONFIG_DIR: this.options.configDir } : process.env
    try {
      this.proc = await spawnBinary(
        {
          binary: this.options.binary,
          args: binaryArgs(this.options, this.configFile, { id: this.sessionId ?? "", resume }),
          cwd: this.cwd,
          env,
        },
        {
          onEvent: (event) => {
            if (generation === this.generation) this.onEvent(event)
          },
          onExit: (detail) => {
            if (generation === this.generation) this.onExit(detail)
          },
        },
      )
    } catch (error) {
      throw RequestError.internalError(undefined, error instanceof Error ? error.message : String(error))
    }
  }

  private onEvent(event: BinaryEvent) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text" && "text" in block && typeof block.text === "string") {
          this.send({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: block.text } })
        }
        if (block.type === "tool_use" && "id" in block && typeof block.id === "string") {
          const name = "name" in block && typeof block.name === "string" ? block.name : "tool"
          this.send({
            sessionUpdate: "tool_call",
            toolCallId: block.id,
            title: name,
            kind: "other",
            status: "pending",
            rawInput: "input" in block ? block.input : undefined,
          })
        }
      }
      return
    }
    if (event.type === "control_response") {
      if (event.response.request_id === this.interruptId) clearTimeout(this.timer)
      return
    }
    if (event.type === "result") {
      const message = event.result ?? event.errors?.join("; ") ?? event.subtype
      this.finish((turn) => {
        if (turn.cancelled) turn.resolve({ stopReason: "cancelled" })
        else if (event.is_error) turn.reject(RequestError.internalError(event, message))
        else turn.resolve({ stopReason: "end_turn" })
      })
    }
  }

  private onExit(detail: string) {
    this.proc = undefined
    this.finish((turn) => {
      if (turn.cancelled) turn.resolve({ stopReason: "cancelled" })
      else turn.reject(RequestError.internalError(undefined, detail))
    })
  }

  private finish(settle: (turn: Turn) => void) {
    const turn = this.turn
    if (!turn) return
    this.turn = undefined
    clearTimeout(this.timer)
    void this.updates.then(() => settle(turn))
  }

  private send(update: SessionUpdate) {
    const sessionId = this.sessionId
    if (!sessionId) return
    this.updates = this.updates
      .then(() => this.connection.sessionUpdate({ sessionId, update }))
      .catch(() => undefined)
  }
}
