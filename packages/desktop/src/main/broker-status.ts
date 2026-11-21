export type BrokerState = "starting" | "running" | "stopped" | "failed"

export type BrokerStatus = { space: string; state: BrokerState; exitCode?: number | null }

export function createBrokerStatus() {
  const latest = new Map<string, BrokerStatus>()
  const listeners = new Set<(status: BrokerStatus) => void>()
  return {
    get: (space: string) => latest.get(space),
    set(status: BrokerStatus) {
      latest.set(status.space, status)
      for (const listener of listeners) listener(status)
    },
    subscribe(listener: (status: BrokerStatus) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type BrokerStatusStore = ReturnType<typeof createBrokerStatus>
