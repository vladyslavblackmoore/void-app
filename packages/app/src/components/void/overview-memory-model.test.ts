import { describe, expect, test } from "bun:test"
import { memoryCard } from "./overview-memory-model"

describe("overview memory card", () => {
  test("absent when no memory connector is configured", () => {
    expect(memoryCard(undefined)).toBeUndefined()
    expect(memoryCard({ other: { status: "connected" } })).toBeUndefined()
  })

  test("reads state and tone from the memory connector", () => {
    expect(memoryCard({ memory: { status: "connected" } })).toEqual({ state: "connected", tone: "green" })
    expect(memoryCard({ memory: { status: "failed", error: "x" } })).toEqual({ state: "error", tone: "red", error: "x" })
    expect(memoryCard({ memory: { status: "disabled" } })).toEqual({ state: "disabled", tone: "grey" })
  })
})
