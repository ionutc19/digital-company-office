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

/** Open/closed state of Piccolo's FinOps panel. */
let finOpsOpen = false
const finOpsListeners = new Set<Listener>()

export function setFinOpsOpen(open: boolean): void {
  finOpsOpen = open
  finOpsListeners.forEach((l) => l(finOpsOpen))
}

export function subscribeFinOps(listener: Listener): () => void {
  finOpsListeners.add(listener)
  listener(finOpsOpen)
  return () => {
    finOpsListeners.delete(listener)
  }
}

/** Open/closed state of Bulma's compliance panel. */
let complianceOpen = false
const complianceListeners = new Set<Listener>()

export function setComplianceOpen(open: boolean): void {
  complianceOpen = open
  complianceListeners.forEach((l) => l(complianceOpen))
}

export function subscribeCompliance(listener: Listener): () => void {
  complianceListeners.add(listener)
  listener(complianceOpen)
  return () => {
    complianceListeners.delete(listener)
  }
}
