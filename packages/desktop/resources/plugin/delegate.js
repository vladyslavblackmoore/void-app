import { createApi, description, formatResult, runDelegate, toolArgs } from "../delegate/core.mjs"

const provider = "subscription"

export default {
  id: "void.delegate",
  server: async (input) => {
    return {
      tool: {
        delegate: {
          description,
          args: toolArgs,
          async execute(args, ctx) {
            const api = createApi({
              url: input.serverUrl.href,
              username: process.env.OPENCODE_SERVER_USERNAME,
              password: process.env.OPENCODE_SERVER_PASSWORD,
              directory: ctx.directory,
            })
            const result = await runDelegate(api, { ...args, parentID: ctx.sessionID }, ctx.abort)
            return {
              title: "delegate",
              output: formatResult(result),
              metadata: { sessionId: result.id },
            }
          },
        },
      },
      "chat.headers": async (hook, output) => {
        if (hook.model?.providerID !== provider) return
        output.headers["x-void-delegate-url"] = input.serverUrl.href
        output.headers["x-void-delegate-directory"] = encodeURIComponent(input.directory)
      },
    }
  },
}
