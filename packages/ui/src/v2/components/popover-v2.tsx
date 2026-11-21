import { Popover as Kobalte } from "@kobalte/core/popover"
import { type ComponentProps, splitProps } from "solid-js"
import "./popover-v2.css"

function PopoverV2Root(props: ComponentProps<typeof Kobalte>) {
  return <Kobalte gutter={6} {...props} />
}

function PopoverV2Content(props: ComponentProps<typeof Kobalte.Content>) {
  const [split, rest] = splitProps(props, ["class", "classList"])
  return (
    <Kobalte.Content
      {...rest}
      data-component="popover-v2-content"
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    />
  )
}

export const PopoverV2 = Object.assign(PopoverV2Root, {
  Trigger: Kobalte.Trigger,
  Anchor: Kobalte.Anchor,
  Portal: Kobalte.Portal,
  Content: PopoverV2Content,
  Title: Kobalte.Title,
  Description: Kobalte.Description,
  CloseButton: Kobalte.CloseButton,
})
