import type { Message } from "@opencode-ai/sdk/v2/client"
import { getSessionContext } from "@/components/session/session-context-metrics"

type Provider = {
  id: string
  name?: string
  models: Record<string, { name?: string; limit: { context: number } } | undefined>
}

export function runModelLabel(messages: Message[], providers: Provider[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    const ref = message.role === "assistant" ? message : message.role === "user" ? message.model : undefined
    if (!ref) continue
    const provider = providers.find((item) => item.id === ref.providerID)
    return provider?.models[ref.modelID]?.name ?? ref.modelID
  }
}

export function runSummary(input: {
  id: string | undefined
  messages: Message[]
  providers: Provider[]
  todos: number
  files: number
}) {
  const context = getSessionContext(input.messages, input.providers)
  const model = runModelLabel(input.messages, input.providers)
  return {
    context,
    model,
    empty: !input.id && !context && !model && input.todos === 0 && input.files === 0,
  }
}
