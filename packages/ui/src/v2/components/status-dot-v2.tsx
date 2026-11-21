import { type ComponentProps, splitProps } from "solid-js"
import { statusToTone, type StatusTone } from "./status-to-tone"
import "./status-dot-v2.css"

export interface StatusDotV2Props extends ComponentProps<"span"> {
  tone?: StatusTone
  status?: string
  glow?: boolean
  size?: "normal" | "large"
}

export function StatusDotV2(props: StatusDotV2Props) {
  const [split, rest] = splitProps(props, ["class", "classList", "tone", "status", "glow", "size"])
  return (
    <span
      {...rest}
      data-component="status-dot-v2"
      data-tone={split.tone ?? statusToTone(split.status)}
      data-size={split.size ?? "normal"}
      data-glow={split.glow ? "" : undefined}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    />
  )
}
