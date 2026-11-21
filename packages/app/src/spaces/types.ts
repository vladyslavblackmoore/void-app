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

export type SpacesPlatform = {
  list(): Promise<SpaceSummary[]>
  start(id: string): Promise<SpaceEndpoint>
  getViewed(): Promise<string>
  setViewed(id: string): Promise<SpaceEndpoint>
}
