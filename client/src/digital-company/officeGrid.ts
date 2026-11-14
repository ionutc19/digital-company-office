/**
 * Pure (Phaser-free) helpers over the Tiled map: walkability grid, chairs and
 * A* pathfinding. Mirrors the collision rules of scenes/Game.ts so agent NPCs
 * walk where a human player could walk.
 */

export interface TiledProperty {
  name: string
  value: unknown
}
export interface TiledObject {
  x: number
  y: number
  width: number
  height: number
  gid?: number
  properties?: TiledProperty[]
}
export interface TiledLayer {
  name: string
  type: string
  width?: number
  data?: number[]
  objects?: TiledObject[]
}
export interface TiledTileset {
  firstgid: number
  tiles?: { id: number; properties?: TiledProperty[] }[]
}
export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets: TiledTileset[]
}

export interface Tile {
  x: number
  y: number
}

export interface WalkGrid {
  width: number
  height: number
  tileSize: number
  walkable: Uint8Array
}

export interface Seat {
  chairX: number
  chairY: number
  /** Tile the character's feet occupy when seated. */
  tile: Tile
  direction: 'up' | 'down' | 'left' | 'right'
  /** Sprite position when seated (chair centre + SkyOffice sittingShiftData). */
  sitX: number
  sitY: number
}

/** Object layers that block movement (collidable: true in Game.ts). */
export const COLLIDING_OBJECT_LAYERS = [
  'ObjectsOnCollide',
  'GenericObjectsOnCollide',
  'Basement',
  'VendingMachine',
]

/** Same values as characters/Player.ts sittingShiftData. */
const SITTING_SHIFT: Record<Seat['direction'], [number, number]> = {
  up: [0, 3],
  down: [0, 3],
  left: [0, -8],
  right: [0, -8],
}

const layer = (map: TiledMap, name: string) => map.layers.find((l) => l.name === name)

export function buildWalkGrid(map: TiledMap): WalkGrid {
  const { width, height } = map
  const tileSize = map.tilewidth
  const walkable = new Uint8Array(width * height)

  const ground = layer(map, 'Ground')
  if (!ground?.data) throw new Error('Map has no Ground tile layer')
  const groundTileset = map.tilesets.find((t) => t.firstgid === 1)
  const colliding = new Set(
    (groundTileset?.tiles || [])
      .filter((t) => t.properties?.some((p) => p.name === 'collides' && p.value === true))
      .map((t) => t.id + (groundTileset?.firstgid || 1))
  )
  ground.data.forEach((gid, i) => {
    const g = gid & 0x1fffffff
    if (g !== 0 && !colliding.has(g)) walkable[i] = 1
  })

  // Collidable objects: tile objects are anchored bottom-left in Tiled.
  for (const name of COLLIDING_OBJECT_LAYERS) {
    for (const o of layer(map, name)?.objects || []) {
      const x0 = Math.floor(o.x / tileSize)
      const x1 = Math.ceil((o.x + o.width) / tileSize) - 1
      const y0 = Math.floor((o.y - o.height) / tileSize)
      const y1 = Math.ceil(o.y / tileSize) - 1
      for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) walkable[y * width + x] = 0
      }
    }
  }
  keepLargestComponent(walkable, width, height)
  return { width, height, tileSize, walkable }
}

/**
 * Clears walkable tiles outside the largest 4-connected region. Small sealed
 * pockets (e.g. between desk partitions) are unreachable for any character,
 * so they must never be chosen as a destination.
 */
function keepLargestComponent(walkable: Uint8Array, width: number, height: number): void {
  const label = new Int32Array(width * height)
  let best = 0
  let bestSize = 0
  let next = 0
  for (let i = 0; i < walkable.length; i++) {
    if (!walkable[i] || label[i]) continue
    next++
    let size = 0
    const stack = [i]
    label[i] = next
    while (stack.length) {
      const k = stack.pop() as number
      size++
      const x = k % width
      const y = Math.floor(k / width)
      const ns = [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, y > 0 ? k - width : -1, y < height - 1 ? k + width : -1]
      for (const n of ns) {
        if (n >= 0 && walkable[n] && !label[n]) {
          label[n] = next
          stack.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
  }
  for (let i = 0; i < walkable.length; i++) if (label[i] !== best) walkable[i] = 0
}

export function isWalkable(grid: WalkGrid, t: Tile): boolean {
  return t.x >= 0 && t.y >= 0 && t.x < grid.width && t.y < grid.height && grid.walkable[t.y * grid.width + t.x] === 1
}

export function readSeats(map: TiledMap): Seat[] {
  const tileSize = map.tilewidth
  return (layer(map, 'Chair')?.objects || []).map((o) => {
    const dir = (o.properties?.find((p) => p.name === 'direction')?.value as Seat['direction']) || 'down'
    const cx = o.x + o.width / 2
    const cy = o.y - o.height / 2
    const [sx, sy] = SITTING_SHIFT[dir]
    return {
      chairX: o.x,
      chairY: o.y,
      tile: { x: Math.floor(cx / tileSize), y: Math.floor((cy + sy) / tileSize) },
      direction: dir,
      sitX: cx + sx,
      sitY: cy + sy,
    }
  })
}

/** Breadth-first search for the closest walkable tile (ties: deterministic order). */
export function nearestWalkable(grid: WalkGrid, from: Tile, maxRadius = 6): Tile | null {
  if (isWalkable(grid, from)) return from
  const seen = new Set<number>([from.y * grid.width + from.x])
  let frontier: Tile[] = [from]
  for (let r = 0; r < maxRadius; r++) {
    const next: Tile[] = []
    for (const t of frontier) {
      for (const n of neighbours(t)) {
        const k = n.y * grid.width + n.x
        if (n.x < 0 || n.y < 0 || n.x >= grid.width || n.y >= grid.height || seen.has(k)) continue
        seen.add(k)
        if (isWalkable(grid, n)) return n
        next.push(n)
      }
    }
    frontier = next
  }
  return null
}

function neighbours(t: Tile): Tile[] {
  return [
    { x: t.x, y: t.y - 1 },
    { x: t.x + 1, y: t.y },
    { x: t.x, y: t.y + 1 },
    { x: t.x - 1, y: t.y },
  ]
}

/**
 * 4-directional A* with Manhattan heuristic. Returns the tile path including
 * start and goal, or null when unreachable. Grid is ~1200 tiles, so a simple
 * open list is fast enough and keeps the code dependency-free.
 */
export function findPath(grid: WalkGrid, start: Tile, goal: Tile): Tile[] | null {
  if (!isWalkable(grid, start) || !isWalkable(grid, goal)) return null
  const w = grid.width
  const key = (t: Tile) => t.y * w + t.x
  const h = (t: Tile) => Math.abs(t.x - goal.x) + Math.abs(t.y - goal.y)
  const g = new Map<number, number>([[key(start), 0]])
  const came = new Map<number, number>()
  const open = new Map<number, { t: Tile; f: number }>([[key(start), { t: start, f: h(start) }]])
  const closed = new Set<number>()

  while (open.size > 0) {
    let bestKey = -1
    let best: { t: Tile; f: number } | null = null
    open.forEach((v, k) => {
      if (!best || v.f < best.f || (v.f === best.f && k < bestKey)) {
        best = v
        bestKey = k
      }
    })
    const current = (best as unknown as { t: Tile; f: number }).t
    if (current.x === goal.x && current.y === goal.y) {
      const path: Tile[] = [current]
      let k = bestKey
      while (came.has(k)) {
        k = came.get(k) as number
        path.unshift({ x: k % w, y: Math.floor(k / w) })
      }
      return path
    }
    open.delete(bestKey)
    closed.add(bestKey)
    for (const n of neighbours(current)) {
      const nk = key(n)
      if (closed.has(nk) || !isWalkable(grid, n)) continue
      const tentative = (g.get(bestKey) as number) + 1
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, bestKey)
        g.set(nk, tentative)
        open.set(nk, { t: n, f: tentative + h(n) })
      }
    }
  }
  return null
}

/** Removes intermediate tiles on straight segments (fewer, smoother tweens). */
export function compressPath(path: Tile[]): Tile[] {
  if (path.length <= 2) return path.slice()
  const out = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]
    const b = path[i]
    const c = path[i + 1]
    const sameLine = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
    if (!sameLine) out.push(b)
  }
  out.push(path[path.length - 1])
  return out
}

export const tileCenter = (grid: WalkGrid, t: Tile) => ({
  x: t.x * grid.tileSize + grid.tileSize / 2,
  y: t.y * grid.tileSize + grid.tileSize / 2,
})
