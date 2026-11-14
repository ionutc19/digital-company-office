/** Open/closed state of John's Control Center, shared across components. */
type Listener = (open: boolean) => void

let isOpen = false
const listeners = new Set<Listener>()

export function setControlCenterOpen(open: boolean): void {
  isOpen = open
  listeners.forEach((l) => l(isOpen))
}

export function toggleControlCenter(): void {
  setControlCenterOpen(!isOpen)
}

export function subscribeControlCenter(listener: Listener): () => void {
  listeners.add(listener)
  listener(isOpen)
  return () => {
    listeners.delete(listener)
  }
}
