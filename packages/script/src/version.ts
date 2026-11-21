export const forkBranch = (channel: string) => channel.startsWith("void/")

export const previewVersion = (channel: string, now: Date) =>
  `0.0.0-${channel}-${now.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`

export function selectVersion(input: { explicit?: string; channel: string; pinned: string; now: Date }) {
  if (input.explicit) return input.explicit
  if (forkBranch(input.channel)) return input.pinned
  return previewVersion(input.channel, input.now)
}
