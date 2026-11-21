export function VoidLogo() {
  return (
    <div data-component="void-logo" class="[app-region:no-drag]">
      <svg width="24" height="24" viewBox="0 0 30 30" aria-hidden="true">
        <ellipse
          cx="15"
          cy="15"
          rx="12"
          ry="7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          transform="rotate(-35 15 15)"
        />
        <circle cx="15" cy="15" r="3" fill="currentColor" />
      </svg>
      <span>VOID</span>
    </div>
  )
}
