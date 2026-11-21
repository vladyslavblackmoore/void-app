// @ts-nocheck
import { StatusDotV2 } from "./status-dot-v2"
import { tones } from "./status-to-tone"

const docs = `### Overview
Small status indicator. Green is active or connected, blue is data in flight, yellow needs attention, red is an error and grey is idle.

### API
- \`tone\`: "green" | "blue" | "yellow" | "red" | "grey".
- \`status\`: Optional state name mapped to a tone when \`tone\` is not set.
- \`glow\`: Adds a glow in the tone colour.
- \`size\`: "normal" (default) | "large".

### Theming/tokens
- Uses \`data-component="status-dot-v2"\` and \`data-tone\`.
- Reads the --void-* status colours and falls back to the v2 state tokens.
`

export default {
  title: "UI V2/Status Dot",
  id: "components-status-dot-v2",
  component: StatusDotV2,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
  args: {
    tone: "green",
    glow: false,
    size: "normal",
  },
  argTypes: {
    tone: {
      control: "select",
      options: tones,
    },
    size: {
      control: "select",
      options: ["normal", "large"],
    },
  },
}

export const Playground = {}

export const Tones = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
      {tones.map((tone) => (
        <StatusDotV2 tone={tone} />
      ))}
      {tones.map((tone) => (
        <StatusDotV2 tone={tone} glow size="large" />
      ))}
    </div>
  ),
}

export const FromStatus = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
      {["running", "busy", "starting", "failed", "stopped"].map((status) => (
        <span style={{ display: "inline-flex", gap: "6px", "align-items": "center" }}>
          <StatusDotV2 status={status} />
          {status}
        </span>
      ))}
    </div>
  ),
}
