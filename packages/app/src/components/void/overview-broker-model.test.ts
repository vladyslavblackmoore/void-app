import { describe, expect, test } from "bun:test"
import { brokerCard } from "./overview-broker-model"

describe("overview broker card", () => {
  test("absent without a status", () => {
    expect(brokerCard(undefined)).toBeUndefined()
  })

  test("maps each state to a label key and a tone", () => {
    expect(brokerCard({ space: "home", state: "running" })).toEqual({ state: "running", tone: "green" })
    expect(brokerCard({ space: "home", state: "starting" })).toEqual({ state: "starting", tone: "yellow" })
    expect(brokerCard({ space: "home", state: "failed", exitCode: 1 })).toEqual({ state: "failed", tone: "red" })
    expect(brokerCard({ space: "home", state: "stopped" })).toEqual({ state: "stopped", tone: "grey" })
  })
})
