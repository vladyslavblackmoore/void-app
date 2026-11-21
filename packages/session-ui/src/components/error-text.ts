export const VOID_MODEL_UNAVAILABLE = "This model is not available. Choose another model."

const UPSTREAM_NAME = /OpenCode Desktop|opencode\.ai/i

function voidActive() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "void"
}

export function neutralErrorText(text: string, voidTheme: boolean = voidActive()) {
  if (!voidTheme) return text
  return UPSTREAM_NAME.test(text) ? VOID_MODEL_UNAVAILABLE : text
}
