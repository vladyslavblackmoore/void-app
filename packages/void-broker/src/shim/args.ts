import { parseArgs } from "node:util"

export type ShimOptions = {
  binary: string
  model?: string
  effort?: string
  permissionMode?: string
  configDir?: string
  settingSources?: string
  deny: string[]
  interruptTimeoutMs: number
  closeTimeoutMs: number
}

export function parseShimArgs(argv: string[]): ShimOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      binary: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      "permission-mode": { type: "string" },
      "config-dir": { type: "string" },
      "setting-sources": { type: "string" },
      deny: { type: "string", multiple: true },
      "interrupt-timeout-ms": { type: "string" },
      "close-timeout-ms": { type: "string" },
    },
  })
  return {
    binary: values.binary ?? "claude",
    model: values.model,
    effort: values.effort,
    permissionMode: values["permission-mode"],
    configDir: values["config-dir"],
    settingSources: values["setting-sources"],
    deny: values.deny ?? [],
    interruptTimeoutMs: Number(values["interrupt-timeout-ms"] ?? 1500),
    closeTimeoutMs: Number(values["close-timeout-ms"] ?? 3000),
  }
}

export function binaryArgs(options: ShimOptions, mcpConfig: string, session: { id: string; resume: boolean }) {
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--replay-user-messages"]
  args.push(session.resume ? "--resume" : "--session-id", session.id)
  if (options.model) args.push("--model", options.model)
  if (options.effort) args.push("--effort", options.effort)
  if (options.permissionMode) args.push("--permission-mode", options.permissionMode)
  args.push("--permission-prompts", "none", "--strict-mcp-config", "--mcp-config", mcpConfig)
  if (options.deny.length > 0) args.push("--disallowed-tools", options.deny.join(","))
  if (options.settingSources) args.push("--setting-sources", options.settingSources)
  return args
}
