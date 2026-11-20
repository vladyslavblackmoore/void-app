import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <path
              opacity="0.7"
              fill-rule="evenodd"
              d="M193.8462 18H212.3077V91.7143H193.8462V18ZM249.2308 18H267.6923V91.7143H249.2308V18ZM212.3077 91.7143H249.2308V110.143H212.3077V91.7143Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              fill-rule="evenodd"
              d="M341.5385 36.4286H304.6154V91.7143H341.5385V36.4286ZM360 110.143H286.1538V18H360V110.143Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              fill-rule="evenodd"
              d="M378.4615 18H433.8462V36.4286H415.3846V91.7143H433.8462V110.143H378.4615V91.7143H396.9231V36.4286H378.4615V18Z"
              fill="currentColor"
            />
            <path
              opacity="0.7"
              fill-rule="evenodd"
              d="M507.6923 36.4286H470.7692V91.7143H507.6923V36.4286ZM507.6923 110.143H452.3077V18H507.6923V36.4286H526.1538V91.7143H507.6923V110.143Z"
              fill="currentColor"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
