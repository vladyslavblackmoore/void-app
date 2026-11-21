// @ts-nocheck
import { CardV2 } from "./card-v2"

const docs = `### Overview
Surface container with solid, glass and inner variants and an optional eyebrow label.

### API
- \`surface\`: "solid" (default) | "glass" | "inner".
- \`eyebrow\`: Optional uppercase label rendered above the content.
- Accepts standard div props.

### Theming/tokens
- Uses \`data-component="card-v2"\` and \`data-surface\`.
- Reads the --void-* tokens and falls back to the v2 tokens.
`

export default {
  title: "UI V2/Card",
  id: "components-card-v2",
  component: CardV2,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
  args: {
    surface: "solid",
    eyebrow: "Eyebrow",
    children: "Card content",
  },
  argTypes: {
    surface: {
      control: "select",
      options: ["solid", "glass", "inner"],
    },
  },
}

export const Playground = {}

export const Surfaces = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", "flex-wrap": "wrap" }}>
      <CardV2 surface="solid" eyebrow="Solid">
        Solid card
      </CardV2>
      <CardV2 surface="glass" eyebrow="Glass">
        Glass card
      </CardV2>
      <CardV2 surface="inner" eyebrow="Inner">
        Inner panel
      </CardV2>
    </div>
  ),
}
