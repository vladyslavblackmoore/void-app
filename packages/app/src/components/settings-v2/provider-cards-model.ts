export type StatusTone = "green" | "grey"

export type ProviderCardInput = {
  id: string
  name: string
  models: string[]
  source?: string
}

export type ProviderCardAction = "connect" | "disconnect" | "none"

export type ProviderCard = {
  id: string
  name: string
  status: "connected" | "disconnected"
  tone: StatusTone
  modelCount: number
  models: string[]
  source?: string
  action: ProviderCardAction
}

export function providerCards(input: {
  connected: ProviderCardInput[]
  available: Omit<ProviderCardInput, "source">[]
}): ProviderCard[] {
  const seen = new Set<string>()
  const cards: ProviderCard[] = []
  for (const item of input.connected) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    cards.push({
      id: item.id,
      name: item.name,
      status: "connected",
      tone: "green",
      modelCount: item.models.length,
      models: item.models,
      source: item.source,
      action: item.source === "env" ? "none" : "disconnect",
    })
  }
  for (const item of input.available) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    cards.push({
      id: item.id,
      name: item.name,
      status: "disconnected",
      tone: "grey",
      modelCount: item.models.length,
      models: item.models,
      action: "connect",
    })
  }
  return cards
}

export function providerSummary(cards: ProviderCard[]) {
  return { connected: cards.filter((card) => card.status === "connected").length, total: cards.length }
}

export function visibleModelTags(models: string[], limit: number) {
  return { tags: models.slice(0, limit), more: Math.max(0, models.length - limit) }
}
