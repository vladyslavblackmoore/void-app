import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M63 6H69V30H63V6ZM81 6H87V30H81V6ZM69 30H81V36H69V30Z" fill="var(--icon-base)" />
        <path d="M111 30H99V18H111V30Z" fill="var(--icon-weak-base)" />
        <path d="M111 12H99V30H111V12ZM117 36H93V6H117V36Z" fill="var(--icon-base)" />
        <path d="M123 6H141V12H135V30H141V36H123V30H129V12H123V6Z" fill="var(--icon-strong-base)" />
        <path d="M165 30H153V18H165V30Z" fill="var(--icon-weak-base)" />
        <path d="M165 12H153V30H165V12ZM165 36H147V6H165V12H171V30H165V36Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
