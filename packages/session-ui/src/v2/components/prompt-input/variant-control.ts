export type PromptInputV2VariantStyle = "menu" | "segmented"

export function variantControlKind(input: { style: PromptInputV2VariantStyle | undefined; count: number }) {
  if (input.count <= 1) return "none"
  return input.style === "segmented" ? "segmented" : "menu"
}
