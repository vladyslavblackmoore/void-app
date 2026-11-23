import { createSignal } from "solid-js"

const [agentsPanelRequest, setAgentsPanelRequest] = createSignal<string>()

export { agentsPanelRequest, setAgentsPanelRequest }

const takeAgentsPanelRequest = (id: string) => {
  if (agentsPanelRequest() !== id) return false
  setAgentsPanelRequest(undefined)
  return true
}

export { takeAgentsPanelRequest }
