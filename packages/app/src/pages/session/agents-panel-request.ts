import { createSignal } from "solid-js"

const [agentsPanelRequest, setAgentsPanelRequest] = createSignal<string>()

export { agentsPanelRequest, setAgentsPanelRequest }
