import { describe, expect, test } from "bun:test"
import { providerCards, providerSummary, visibleModelTags } from "./provider-cards-model"

const connected = [
  { id: "alpha", name: "Alpha", models: ["a-1", "a-2", "a-3", "a-4"], source: "api" },
  { id: "beta", name: "Beta", models: [], source: "env" },
]
const available = [
  { id: "beta", name: "Beta", models: ["b-1"] },
  { id: "gamma", name: "Gamma", models: ["g-1", "g-2"] },
]

describe("provider cards model", () => {
  test("connected providers come first with a connected status", () => {
    const cards = providerCards({ connected, available })
    expect(cards.map((card) => card.id)).toEqual(["alpha", "beta", "gamma"])
    expect(cards[0].status).toBe("connected")
    expect(cards[0].tone).toBe("green")
  })

  test("a provider that is both connected and available appears once", () => {
    const cards = providerCards({ connected, available })
    expect(cards.filter((card) => card.id === "beta")).toHaveLength(1)
    expect(cards.find((card) => card.id === "beta")?.status).toBe("connected")
  })

  test("providers that are not connected have a grey tone and the connect action", () => {
    const card = providerCards({ connected, available }).find((item) => item.id === "gamma")
    expect(card?.status).toBe("disconnected")
    expect(card?.tone).toBe("grey")
    expect(card?.action).toBe("connect")
    expect(card?.modelCount).toBe(2)
  })

  test("environment providers cannot be disconnected", () => {
    const cards = providerCards({ connected, available })
    expect(cards.find((card) => card.id === "alpha")?.action).toBe("disconnect")
    expect(cards.find((card) => card.id === "beta")?.action).toBe("none")
  })

  test("summary counts connected providers and all cards", () => {
    expect(providerSummary(providerCards({ connected, available }))).toEqual({ connected: 2, total: 3 })
  })

  test("model tags are capped and report the overflow", () => {
    expect(visibleModelTags(["a", "b", "c", "d"], 2)).toEqual({ tags: ["a", "b"], more: 2 })
    expect(visibleModelTags(["a"], 2)).toEqual({ tags: ["a"], more: 0 })
    expect(visibleModelTags([], 2)).toEqual({ tags: [], more: 0 })
  })
})
