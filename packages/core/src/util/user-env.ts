const KEY = "VOID_USER_ENV"

export function userEnv(env: NodeJS.ProcessEnv = process.env, inherited: NodeJS.ProcessEnv = process.env) {
  const result: NodeJS.ProcessEnv = { ...env }
  const recorded = env[KEY]
  if (recorded === undefined) return result
  result[KEY] = undefined
  for (const [name, value] of Object.entries(parse(recorded))) {
    if (env[name] === inherited[name]) result[name] = typeof value === "string" && value ? value : undefined
  }
  return result
}

function parse(text: string): object {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === "object" ? value : {}
  } catch {
    return {}
  }
}
