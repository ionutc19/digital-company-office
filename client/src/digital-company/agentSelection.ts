/**
 * Which agent the detail panel shows. Shared by the roster (React) and the
 * NPCs (Phaser) without coupling them to each other.
 */
type Listener = (agentId: string | null) => void

let selected: string | null = null
const listeners = new Set<Listener>()

export function selectAgent(agentId: string | null): void {
  selected = agentId
  listeners.forEach((l) => l(selected))
}

export function subscribeAgentSelection(listener: Listener): () => void {
  listeners.add(listener)
  listener(selected)
  return () => {
    listeners.delete(listener)
  }
}

/** Hermes timestamps are Unix seconds; tolerate milliseconds too. */
export function toDate(ts: number | null | undefined): Date | null {
  if (!ts) return null
  return new Date(ts < 1e12 ? ts * 1000 : ts)
}

export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  const d = toDate(ts)
  if (!d) return ''
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
