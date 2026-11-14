/**
 * Tiny framework-free store bridging the React status poller and the Phaser
 * scene. It replays the latest snapshot to late subscribers, so the Game
 * scene can start after the first poll without missing state.
 */

export interface AgentStatusEntry {
  id: string
  status: string
  taskTitle?: string | null
}

export interface AgentStatusSnapshot {
  /** false when the Office API / Hermes is unreachable (agents shown OFFLINE). */
  connected: boolean
  agents: AgentStatusEntry[]
  receivedAt: number
}

type Listener = (snapshot: AgentStatusSnapshot) => void

let latest: AgentStatusSnapshot | null = null
const listeners = new Set<Listener>()

export function publishAgentStatus(snapshot: AgentStatusSnapshot): void {
  latest = snapshot
  listeners.forEach((l) => l(snapshot))
}

export function subscribeAgentStatus(listener: Listener): () => void {
  listeners.add(listener)
  if (latest) listener(latest)
  return () => {
    listeners.delete(listener)
  }
}

/** Test helper. */
export function resetAgentStatusStore(): void {
  latest = null
  listeners.clear()
}
