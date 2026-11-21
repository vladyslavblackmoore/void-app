import { parseArgs } from "node:util"

export type ShimOptions = {
  binary: string
  model?: string
  effort?: string
  permissionMode?: string
  configDir?: string
  settingSources?: string
  interruptTimeoutMs: number
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
      "interrupt-timeout-ms": { type: "string" },
    },
  })
  return {
    binary: values.binary ?? "claude",
    model: values.model,
    effort: values.effort,
    permissionMode: values["permission-mode"],
    configDir: values["config-dir"],
    settingSources: values["setting-sources"],
    interruptTimeoutMs: Number(values["interrupt-timeout-ms"] ?? 1500),
  }
}

export function binaryArgs(options: ShimOptions, mcpConfig: string, session: { id: string; resume: boolean }) {
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"]
  args.push(session.resume ? "--resume" : "--session-id", session.id)
  if (options.model) args.push("--model", options.model)
  if (options.effort) args.push("--effort", options.effort)
  if (options.permissionMode) args.push("--permission-mode", options.permissionMode)
  args.push("--permission-prompts", "none", "--strict-mcp-config", "--mcp-config", mcpConfig)
  if (options.settingSources) args.push("--setting-sources", options.settingSources)
  return args
}
