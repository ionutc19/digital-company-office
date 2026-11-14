import { test } from 'node:test'
import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as path from 'path'

import { timeAgo, toDate } from './agentSelection'
import { buildWalkGrid, compressPath, findPath, isWalkable, readSeats, TiledMap } from './officeGrid'
import { areaSpots, AreaKind, OfficeLayout, seededRandom, SpotAllocator, workstationSpot, zoneForStatus } from './officeZones'

const root = path.resolve(__dirname, '..', '..')
const map: TiledMap = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/map/map.json'), 'utf8'))
const layout: OfficeLayout = JSON.parse(fs.readFileSync(path.join(__dirname, 'officeLayout.json'), 'utf8'))
const grid = buildWalkGrid(map)
const seats = readSeats(map)
const AREAS: AreaKind[] = ['lounge', 'waiting', 'review', 'approval', 'blocked', 'offline']
const AGENT_IDS = ['john', 'alakazam', 'piccolo', 'bulma', 'goku', 'charizard', 'pikachu', 'gengar', 'machamp', 'porygon', 'psyduck']

test('maps every live status to the documented zone', () => {
  assert.equal(zoneForStatus('working'), 'workstation')
  assert.equal(zoneForStatus('waiting'), 'waiting')
  assert.equal(zoneForStatus('reviewing'), 'review')
  assert.equal(zoneForStatus('blocked'), 'blocked')
  assert.equal(zoneForStatus('human-approval'), 'approval')
  assert.equal(zoneForStatus('idle'), 'lounge')
  assert.equal(zoneForStatus('offline'), 'offline')
  assert.equal(zoneForStatus('something-new'), 'lounge')
})

test('layout defines all 11 agents with distinct workstations', () => {
  assert.deepEqual(Object.keys(layout.agents).sort(), [...AGENT_IDS].sort())
  const chairs = Object.values(layout.agents).map((a) => `${a.workstation.chairX},${a.workstation.chairY}`)
  assert.equal(new Set(chairs).size, 11)
})

test('every workstation chair exists in the map and is reachable', () => {
  for (const id of AGENT_IDS) {
    const spot = workstationSpot(grid, seats, layout, id)
    assert.ok(isWalkable(grid, spot.tile), `${id} approach tile walkable`)
    assert.ok(spot.sit, `${id} sits at the workstation`)
  }
})

test('every area has room for all 11 agents', () => {
  for (const area of AREAS) {
    const spots = areaSpots(grid, seats, layout, area)
    assert.ok(spots.length >= 11, `${area} has ${spots.length} spots`)
    assert.equal(new Set(spots.map((s) => s.id)).size, spots.length, `${area} spot ids unique`)
  }
})

test('all zones are mutually reachable (no NPC can get stuck)', () => {
  const anchors = [
    ...AGENT_IDS.map((id) => workstationSpot(grid, seats, layout, id).tile),
    ...AREAS.map((a) => areaSpots(grid, seats, layout, a)[0].tile),
  ]
  for (const a of anchors) {
    for (const b of anchors) {
      assert.ok(findPath(grid, a, b), `path ${a.x},${a.y} -> ${b.x},${b.y}`)
    }
  }
})

test('every spot of every area is reachable from every workstation', () => {
  const hub = areaSpots(grid, seats, layout, 'lounge')[0].tile
  const targets = [
    ...AGENT_IDS.map((id) => workstationSpot(grid, seats, layout, id).tile),
    ...AREAS.flatMap((a) => areaSpots(grid, seats, layout, a).map((s) => s.tile)),
  ]
  for (const t of targets) assert.ok(findPath(grid, hub, t), `unreachable tile ${t.x},${t.y}`)
})

test('A* returns a contiguous walkable path and compression keeps the ends', () => {
  const a = workstationSpot(grid, seats, layout, 'john').tile
  const b = areaSpots(grid, seats, layout, 'lounge')[0].tile
  const p = findPath(grid, a, b)!
  for (let i = 1; i < p.length; i++) {
    assert.equal(Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y), 1)
    assert.ok(isWalkable(grid, p[i]))
  }
  const c = compressPath(p)
  assert.deepEqual(c[0], p[0])
  assert.deepEqual(c[c.length - 1], p[p.length - 1])
  assert.ok(c.length <= p.length)
})

test('spot allocator never gives one spot to two agents', () => {
  const candidates = Object.fromEntries(AREAS.map((a) => [a, areaSpots(grid, seats, layout, a)])) as Record<AreaKind, ReturnType<typeof areaSpots>>
  const alloc = new SpotAllocator(candidates)
  const ids = AGENT_IDS.map((id, i) => alloc.allocate(id, i, 'review')!.id)
  assert.equal(new Set(ids).size, 11)
  alloc.release('john')
  assert.equal(alloc.spotOf('john'), undefined)
  assert.ok(alloc.allocate('john', 0, 'review'))
})

test('seeded random is deterministic', () => {
  const r1 = seededRandom(42)
  const r2 = seededRandom(42)
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2())
})

test('timeAgo handles Hermes Unix seconds and milliseconds', () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0)
  assert.equal(timeAgo(now / 1000 - 90, now), '1m ago')
  assert.equal(timeAgo(now - 2 * 3600 * 1000, now), '2h ago')
  assert.equal(timeAgo(null, now), '')
  assert.equal(toDate(0), null)
})
