import { type JSX, splitProps } from "solid-js"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useLanguage } from "@/context/language"

const HOME_NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"

export function HomeNav(props: { class?: string; onOpenHelp: () => void }) {
  const language = useLanguage()
  return (
    <nav data-component="home-nav" class={`${props.class ?? ""} min-w-0 flex-col gap-1`}>
      <HomeNavButton
        type="button"
        data-action="home-settings"
        data-selected=""
        class="[&>[data-slot=icon-svg]]:text-v2-icon-icon-muted"
      >
        <IconV2 name="settings-gear" size="small" />
        <span class={HOME_NAV_LABEL}>{language.t("sidebar.settings")}</span>
      </HomeNavButton>
      <HomeNavButton
        type="button"
        data-action="home-help"
        class="[&>[data-slot=icon-svg]]:text-v2-icon-icon-muted"
        onClick={props.onOpenHelp}
      >
        <IconV2 name="help" size="small" />
        <span class={HOME_NAV_LABEL}>{language.t("sidebar.help")}</span>
      </HomeNavButton>
    </nav>
  )
}

function HomeNavButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"])
  return (
    <button
      {...rest}
      class={`
        flex h-7 min-w-0 w-full shrink-0 cursor-default items-center gap-2 rounded-[6px] bg-transparent px-1.5 text-left
        text-v2-text-text-muted [font-weight:440] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out
        hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
        data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base
        data-[selected]:hover:bg-v2-background-bg-layer-03
        focus-visible:bg-v2-background-bg-layer-01 focus-visible:text-v2-text-text-base focus-visible:outline-none
        focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]
        ${local.class ?? ""}
      `}
      classList={local.classList}
    >
      {local.children}
    </button>
  )
}
