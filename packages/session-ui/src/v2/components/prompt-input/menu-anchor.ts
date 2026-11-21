export type PromptInputV2MenuStyle = "void"

export function dockAnchorRect(anchor?: HTMLElement) {
  if (!anchor) return undefined
  const rect = anchor.getBoundingClientRect()
  const dock = anchor.closest('[data-component="prompt-input-v2"]')
  const top = dock ? dock.getBoundingClientRect().top : rect.top
  return { x: rect.left, y: top, width: rect.width, height: 0 }
}
