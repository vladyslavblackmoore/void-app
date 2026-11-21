import { type ComponentProps, Show, splitProps } from "solid-js"
import "./card-v2.css"

export interface CardV2Props extends ComponentProps<"div"> {
  surface?: "solid" | "glass" | "inner"
  eyebrow?: string
}

export function CardV2(props: CardV2Props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children", "surface", "eyebrow"])
  return (
    <div
      {...rest}
      data-component="card-v2"
      data-surface={split.surface ?? "solid"}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    >
      <Show when={split.eyebrow}>
        <span data-slot="card-v2-eyebrow">{split.eyebrow}</span>
      </Show>
      {split.children}
    </div>
  )
}
