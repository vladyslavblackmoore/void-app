export type CliMcpServer =
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }

export function mcpSanitize(value: string): string
export function mapMcpServers(mcp: unknown, label?: string): Record<string, CliMcpServer>
