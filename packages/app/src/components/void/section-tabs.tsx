import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import { visibleSections, type VoidSection } from "./section-tabs-model"

export function SectionTabs(props: { active: VoidSection; onSelect: (section: VoidSection) => void }) {
  const language = useLanguage()

  return (
    <nav data-component="void-section-tabs" aria-label={language.t("void.nav.label")}>
      <For each={visibleSections()}>
        {(item) => (
          <button
            type="button"
            data-slot="void-section-tab"
            data-active={props.active === item.id ? "true" : undefined}
            aria-current={props.active === item.id ? "page" : undefined}
            onClick={() => props.onSelect(item.id)}
          >
            {language.t(`void.nav.${item.id}`)}
          </button>
        )}
      </For>
    </nav>
  )
}
