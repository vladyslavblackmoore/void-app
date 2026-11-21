const RELEASE_VERSION = /^\d+\.\d+\.\d+$/

export function pluginPackageVersion(version: string, local: boolean) {
  if (local) return undefined
  return RELEASE_VERSION.test(version) ? version : undefined
}
