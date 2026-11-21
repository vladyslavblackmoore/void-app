const NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/

export const isSecretName = (name: string) => NAME.test(name)

export const secretErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message || fallback
  }
  return fallback
}

export const secretUpdatedAt = (updated: number | string) =>
  typeof updated === "number" && Number.isFinite(updated) ? new Date(updated) : undefined
