import type { BrokerState, BrokerStatus } from "@/spaces/types"
import type { TileTone } from "./connector-model"

const tones: Record<BrokerState, TileTone> = {
  starting: "yellow",
  running: "green",
  stopped: "grey",
  failed: "red",
}

export type BrokerCard = { state: BrokerState; tone: TileTone; exitCode?: number }

export function brokerCard(status: BrokerStatus | undefined): BrokerCard | undefined {
  if (!status) return undefined
  const card: BrokerCard = { state: status.state, tone: tones[status.state] }
  if (typeof status.exitCode === "number") card.exitCode = status.exitCode
  return card
}
