;(function () {
  var key = "opencode-theme-id"
  var themeId = localStorage.getItem(key) || "void"

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("opencode-theme-css-light")
    localStorage.removeItem("opencode-theme-css-dark")
  }

  var marker = "opencode-theme-void-migrated"
  if (!localStorage.getItem(marker)) {
    if (localStorage.getItem(key)) {
      themeId = "void"
      localStorage.setItem(key, themeId)
    }
    localStorage.setItem(marker, "1")
  }

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark =
    scheme === "dark" ||
    (scheme === "system" &&
      (matchMedia("(prefers-color-scheme: dark)").matches || !matchMedia("(prefers-color-scheme: light)").matches))
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  var canvas = themeId === "void" ? (isDark ? "#0c0d0f" : "#eceef1") : isDark ? "#080808" : "#fafafa"
  document.documentElement.style.backgroundColor = canvas

  // Update theme-color meta tag to match app color scheme
  var metas = document.querySelectorAll("meta[name='theme-color']")
  if (metas.length > 0) metas[0].setAttribute("content", canvas)

  if (themeId === "oc-2") return

  var css = localStorage.getItem("opencode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
