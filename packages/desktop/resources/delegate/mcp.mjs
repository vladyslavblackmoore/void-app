import { createApi, createMcp, serveMcp } from "./core.mjs"

const env = process.env
const api = createApi({
  url: env.VOID_DELEGATE_URL,
  username: env.VOID_DELEGATE_USER,
  password: env.VOID_DELEGATE_PASSWORD,
  directory: env.VOID_DELEGATE_DIRECTORY,
})
const handle = createMcp(api, env.VOID_DELEGATE_PARENT)

let stopping
const stop = () => {
  stopping ??= handle.shutdown(3000).finally(() => process.exit(0))
  return stopping
}

serveMcp(handle, process.stdin, process.stdout, stop)
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop)
