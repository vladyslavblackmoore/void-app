import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(0 4)">
        <rect width="32" height="32" rx="7" fill="#2a2b30" />
        <g fill="#c9cacf">
          <rect x="4" y="4" width="4" height="4" rx="1.5" />
          <rect x="8" y="8" width="2" height="2" fill-opacity="0.6" />
          <rect x="26" y="14" width="4" height="4" rx="1.5" />
          <rect x="24" y="16" width="2" height="2" fill-opacity="0.6" />
          <rect x="12" y="26" width="4" height="4" rx="1.5" />
          <rect x="14" y="24" width="2" height="2" fill-opacity="0.6" />
        </g>
        <g fill="#d4f23a">
          <rect x="24" y="4" width="4" height="4" rx="1.5" />
          <rect x="22" y="8" width="2" height="2" fill-opacity="0.75" />
        </g>
        <circle cx="16" cy="16" r="8" fill="#050506" />
      </g>
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(0 4)">
        <rect width="32" height="32" rx="7" fill="#2a2b30" />
        <g fill="#c9cacf">
          <rect x="4" y="4" width="4" height="4" rx="1.5" />
          <rect x="8" y="8" width="2" height="2" fill-opacity="0.6" />
          <rect x="26" y="14" width="4" height="4" rx="1.5" />
          <rect x="24" y="16" width="2" height="2" fill-opacity="0.6" />
          <rect x="12" y="26" width="4" height="4" rx="1.5" />
          <rect x="14" y="24" width="2" height="2" fill-opacity="0.6" />
        </g>
        <g fill="#d4f23a">
          <rect x="24" y="4" width="4" height="4" rx="1.5" />
          <rect x="22" y="8" width="2" height="2" fill-opacity="0.75" />
        </g>
        <circle cx="16" cy="16" r="8" fill="#050506" />
      </g>
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
      <g transform="translate(36 0) scale(1.3125)">
        <rect width="32" height="32" rx="7" fill="#2a2b30" />
        <g fill="#c9cacf">
          <rect x="4" y="4" width="4" height="4" rx="1.5" />
          <rect x="8" y="8" width="2" height="2" fill-opacity="0.6" />
          <rect x="26" y="14" width="4" height="4" rx="1.5" />
          <rect x="24" y="16" width="2" height="2" fill-opacity="0.6" />
          <rect x="12" y="26" width="4" height="4" rx="1.5" />
          <rect x="14" y="24" width="2" height="2" fill-opacity="0.6" />
        </g>
        <g fill="#d4f23a">
          <rect x="24" y="4" width="4" height="4" rx="1.5" />
          <rect x="22" y="8" width="2" height="2" fill-opacity="0.75" />
        </g>
        <circle cx="16" cy="16" r="8" fill="#050506" />
      </g>
      <text
        x="94"
        y="33"
        fill="var(--icon-strong-base)"
        font-family="var(--font-family-sans)"
        font-size="34"
        font-weight="700"
        letter-spacing="6"
      >
        VOID
      </text>
    </svg>
  )
}
