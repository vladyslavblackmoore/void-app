// @ts-nocheck
import { PopoverV2 } from "./popover-v2"
import { ButtonV2 } from "./button-v2"

const docs = `### Overview
Glass popover built on the Kobalte popover.

### API
- \`PopoverV2\`: root, accepts the Kobalte popover props.
- \`PopoverV2.Trigger\`, \`PopoverV2.Portal\`, \`PopoverV2.Content\`, \`PopoverV2.Title\`, \`PopoverV2.Description\`, \`PopoverV2.CloseButton\`.

### Theming/tokens
- Uses \`data-component="popover-v2-content"\`.
- Reads the --void-* glass tokens and falls back to the v2 tokens.
`

export default {
  title: "UI V2/Popover",
  id: "components-popover-v2",
  component: PopoverV2,
  tags: ["autodocs"],
  parameters: {
    frameHeight: "240px",
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = {
  render: () => (
    <PopoverV2>
      <PopoverV2.Trigger as={ButtonV2}>Open</PopoverV2.Trigger>
      <PopoverV2.Portal>
        <PopoverV2.Content>
          <PopoverV2.Title>Title</PopoverV2.Title>
          <PopoverV2.Description>Popover content</PopoverV2.Description>
        </PopoverV2.Content>
      </PopoverV2.Portal>
    </PopoverV2>
  ),
}
