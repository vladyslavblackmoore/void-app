import { createApi, createMcp, serveMcp } from "./core.mjs"

const env = process.env
const api = createApi({
  url: env.VOID_DELEGATE_URL,
  username: env.VOID_DELEGATE_USER,
  password: env.VOID_DELEGATE_PASSWORD,
  directory: env.VOID_DELEGATE_DIRECTORY,
})

serveMcp(createMcp(api, env.VOID_DELEGATE_PARENT), process.stdin, process.stdout)
