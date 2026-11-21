export const HOME_SPACE_ID = "home"

export type SpaceSummary = {
  id: string
  name: string
  color: string
  class: "personal" | "company"
  running: boolean
  busy: boolean
}

export type SpaceEndpoint = {
  url: string
  username: string
  password: string
}

export type CoreStatus = {
  space: string
  state: "restarting" | "up" | "failed"
  attempt?: number
  delayMs?: number
  endpoint?: SpaceEndpoint
}

export type BrokerState = "starting" | "running" | "stopped" | "failed"

export type BrokerStatus = {
  space: string
  state: BrokerState
  exitCode?: number | null
}

export type SpacesPlatform = {
  list(): Promise<SpaceSummary[]>
  start(id: string): Promise<SpaceEndpoint>
  getViewed(): Promise<string>
  setViewed(id: string): Promise<SpaceEndpoint>
  onCoreStatus?(callback: (status: CoreStatus) => void): () => void
  getBrokerStatus?(space: string): Promise<BrokerStatus | undefined>
  onBrokerStatus?(callback: (status: BrokerStatus) => void): () => void
}
