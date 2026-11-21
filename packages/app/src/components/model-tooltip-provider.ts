const upstream = /^opencode(\s+(zen|go))?$/i

export function tooltipProviderName(name: string, theme: string | undefined) {
  return theme === "void" && upstream.test(name.trim()) ? "VOID" : name
}
