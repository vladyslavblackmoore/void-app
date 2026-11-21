import type { BrokerState, BrokerStatus } from "@/spaces/types"
import type { TileTone } from "./connector-model"

const tones: Record<BrokerState, TileTone> = {
  starting: "yellow",
  running: "green",
  stopped: "grey",
  failed: "red",
}

export function brokerCard(status: BrokerStatus | undefined): { state: BrokerState; tone: TileTone } | undefined {
  if (!status) return undefined
  return { state: status.state, tone: tones[status.state] }
}
