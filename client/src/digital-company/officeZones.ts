/**
 * Pure status -> location model for agent NPCs. Deterministic and Phaser-free.
 * Status values match server/digital-company/status.ts (lower-case strings).
 */
import { isWalkable, nearestWalkable, Seat, Tile, WalkGrid } from './officeGrid'

export type ZoneKind = 'workstation' | 'waiting' | 'review' | 'approval' | 'blocked' | 'lounge' | 'offline'
export type AreaKind = Exclude<ZoneKind, 'workstation'>

export interface OfficeLayout {
  version: number
  agents: Record<string, { texture: string; tint: string; workstation: { chairX: number; chairY: number } }>
  areas: Record<AreaKind, { label: string; rect: [number, number, number, number] }>
}

/** Where an agent should be for a given live status. */
export function zoneForStatus(status: string): ZoneKind {
  switch (status) {
    case 'working':
      return 'workstation'
    case 'waiting':
      return 'waiting'
    case 'reviewing':
      return 'review'
    case 'blocked':
      return 'blocked'
    case 'human-approval':
      return 'approval'
    case 'offline':
      return 'offline'
    case 'idle':
    default:
      return 'lounge'
  }
}

/** A place an agent can stand or sit. */
export interface Spot {
  id: string
  tile: Tile
  /** Pixel position of the sprite at the spot. */
  x: number
  y: number
  sit?: Seat['direction']
}

const inRect = (t: Tile, [x, y, w, h]: [number, number, number, number]) =>
  t.x >= x && t.x < x + w && t.y >= y && t.y < y + h

/**
 * Candidate spots of an area: first the chairs inside it (agents sit), then the
 * walkable tiles in a stable, spread-out order. Chairs claimed as a
 * workstation are excluded so nobody sits on a colleague's desk chair.
 */
export function areaSpots(
  grid: WalkGrid,
  seats: Seat[],
  layout: OfficeLayout,
  area: AreaKind
): Spot[] {
  const rect = layout.areas[area].rect
  const reserved = new Set(Object.values(layout.agents).map((a) => `${a.workstation.chairX},${a.workstation.chairY}`))
  const spots: Spot[] = []
  const used = new Set<string>()

  for (const s of seats) {
    if (!inRect(s.tile, rect) || reserved.has(`${s.chairX},${s.chairY}`)) continue
    const approach = nearestWalkable(grid, s.tile)
    if (!approach) continue
    spots.push({ id: `${area}:chair:${s.chairX},${s.chairY}`, tile: approach, x: s.sitX, y: s.sitY, sit: s.direction })
    used.add(`${approach.x},${approach.y}`)
  }

  const free: Tile[] = []
  const [rx, ry, rw, rh] = rect
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const t = { x, y }
      if (isWalkable(grid, t) && !used.has(`${x},${y}`)) free.push(t)
    }
  }
  // Spread agents out: take every other tile first, then the rest.
  const ordered = [...free.filter((t) => (t.x + t.y) % 2 === 0), ...free.filter((t) => (t.x + t.y) % 2 === 1)]
  for (const t of ordered) {
    spots.push({
      id: `${area}:tile:${t.x},${t.y}`,
      tile: t,
      x: t.x * grid.tileSize + grid.tileSize / 2,
      y: t.y * grid.tileSize + grid.tileSize / 2,
    })
  }
  return spots
}

export function workstationSpot(grid: WalkGrid, seats: Seat[], layout: OfficeLayout, agentId: string): Spot {
  const ws = layout.agents[agentId]?.workstation
  if (!ws) throw new Error(`No workstation configured for agent '${agentId}'`)
  const seat = seats.find((s) => s.chairX === ws.chairX && s.chairY === ws.chairY)
  if (!seat) throw new Error(`Workstation chair ${ws.chairX},${ws.chairY} for '${agentId}' not found in map`)
  const approach = nearestWalkable(grid, seat.tile)
  if (!approach) throw new Error(`Workstation of '${agentId}' is not reachable`)
  return { id: `workstation:${agentId}`, tile: approach, x: seat.sitX, y: seat.sitY, sit: seat.direction }
}

/**
 * Tracks which spot each agent holds so two NPCs never share a spot.
 * Allocation is deterministic: the agent's index picks a preferred starting
 * point in the candidate list, then the first free spot after it is used.
 */
export class SpotAllocator {
  private holder = new Map<string, string>() // spotId -> agentId
  private held = new Map<string, string>() // agentId -> spotId

  constructor(private readonly candidates: Record<AreaKind, Spot[]>) {}

  allocate(agentId: string, agentIndex: number, area: AreaKind, exclude?: string): Spot | null {
    const list = this.candidates[area]
    if (!list || list.length === 0) return null
    this.release(agentId)
    const start = (agentIndex * 3) % list.length
    for (let i = 0; i < list.length; i++) {
      const spot = list[(start + i) % list.length]
      if (spot.id === exclude) continue
      if (!this.holder.has(spot.id)) {
        this.holder.set(spot.id, agentId)
        this.held.set(agentId, spot.id)
        return spot
      }
    }
    return null
  }

  release(agentId: string): void {
    const spotId = this.held.get(agentId)
    if (spotId) this.holder.delete(spotId)
    this.held.delete(agentId)
  }

  spotOf(agentId: string): string | undefined {
    return this.held.get(agentId)
  }
}

/** Small deterministic PRNG (mulberry32) for idle wandering. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
