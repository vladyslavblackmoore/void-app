import { describe, expect, test } from "bun:test"
import { agentsPanelRequest, setAgentsPanelRequest, takeAgentsPanelRequest } from "./agents-panel-request"

describe("takeAgentsPanelRequest", () => {
  test("consumes a matching request once", () => {
    setAgentsPanelRequest("ses_1")
    expect(takeAgentsPanelRequest("ses_1")).toBe(true)
    expect(agentsPanelRequest()).toBeUndefined()
    expect(takeAgentsPanelRequest("ses_1")).toBe(false)
  })

  test("keeps a request for another session", () => {
    setAgentsPanelRequest("ses_2")
    expect(takeAgentsPanelRequest("ses_1")).toBe(false)
    expect(agentsPanelRequest()).toBe("ses_2")
    setAgentsPanelRequest(undefined)
  })
})
