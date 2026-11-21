const DIRECTORY_APPS = new Set(["terminal", "iterm2", "ghostty", "warp", "powershell"])

export function openTargets(app: string, directory: string, paths: string[] = []) {
  if (paths.length === 0 || DIRECTORY_APPS.has(app)) return { reveal: false, paths: [directory] }
  if (app === "finder") return { reveal: true, paths: [paths[0]] }
  return { reveal: false, paths }
}

export function changedPaths(directory: string, files: string[]) {
  const root = directory.replace(/[\\/]+$/, "")
  return [...new Set(files)].map((file) => (/^([\\/]|[a-zA-Z]:[\\/])/.test(file) ? file : `${root}/${file}`))
}
