import Phaser from 'phaser'

import AgentAvatar, { PixelPoint, STANDING_Y_OFFSET } from '../characters/AgentAvatar'
import { Event, phaserEvents } from '../events/EventCenter'
import { digitalCompanyAgents } from './agents'
import { AgentStatusSnapshot, subscribeAgentStatus } from './agentStatusStore'
import officeLayout from './officeLayout.json'
import {
  buildWalkGrid,
  compressPath,
  findPath,
  nearestWalkable,
  readSeats,
  Seat,
  Tile,
  TiledMap,
  tileCenter,
  WalkGrid,
} from './officeGrid'
import {
  AreaKind,
  areaSpots,
  OfficeLayout,
  seededRandom,
  Spot,
  SpotAllocator,
  workstationSpot,
  ZoneKind,
  zoneForStatus,
} from './officeZones'

const AREAS: AreaKind[] = ['lounge', 'waiting', 'review', 'approval', 'blocked', 'offline']
const IDLE_WANDER_INTERVAL_MS = 6000
const IDLE_WANDER_PROBABILITY = 0.3

/**
 * Creates one local NPC per Digital Company agent and moves it to the zone
 * that matches its live Hermes Kanban status. No network sessions, no LLM
 * calls: input is the status snapshot published by useHermesAgents.
 */
export default class AgentNpcManager {
  private readonly layout = officeLayout as unknown as OfficeLayout
  private readonly grid: WalkGrid
  private readonly seats: Seat[]
  private readonly allocator: SpotAllocator
  private readonly avatars = new Map<string, AgentAvatar>()
  private readonly zones = new Map<string, ZoneKind>()
  /** Tile each agent currently occupies (start point for the next path). */
  private readonly tiles = new Map<string, Tile>()
  private readonly random = seededRandom(20261114)
  private initialized = false
  private unsubscribe?: () => void
  private wanderTimer?: Phaser.Time.TimerEvent

  constructor(private readonly scene: Phaser.Scene, map: TiledMap) {
    this.grid = buildWalkGrid(map)
    this.seats = readSeats(map)
    const candidates = Object.fromEntries(
      AREAS.map((a) => [a, areaSpots(this.grid, this.seats, this.layout, a)])
    ) as Record<AreaKind, Spot[]>
    this.allocator = new SpotAllocator(candidates)

    digitalCompanyAgents.forEach((agent) => {
      const cfg = this.layout.agents[agent.id]
      if (!cfg) {
        console.warn(`[agent-npc] no layout entry for '${agent.id}', skipping`)
        return
      }
      // Hidden until the first status snapshot decides where the agent is.
      const start = this.workstation(agent.id)
      const avatar = new AgentAvatar(scene, {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        texture: cfg.texture,
        tint: Phaser.Display.Color.HexStringToColor(cfg.tint).color,
        x: start.x,
        y: start.y,
      })
      avatar.sprite.setVisible(false)
      avatar.onClick((id) => phaserEvents.emit(Event.AGENT_NPC_CLICKED, id))
      this.avatars.set(agent.id, avatar)
    })

    this.unsubscribe = subscribeAgentStatus((s) => this.apply(s))
    this.wanderTimer = scene.time.addEvent({
      delay: IDLE_WANDER_INTERVAL_MS,
      loop: true,
      callback: () => this.wander(),
    })
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
  }

  destroy(): void {
    this.unsubscribe?.()
    this.wanderTimer?.remove()
    this.avatars.forEach((a) => a.destroy())
    this.avatars.clear()
  }

  private apply(snapshot: AgentStatusSnapshot): void {
    const byId = new Map(snapshot.agents.map((a) => [a.id, a]))
    let index = 0
    this.avatars.forEach((avatar, id) => {
      const i = index++
      const status = snapshot.connected ? byId.get(id)?.status ?? 'idle' : 'offline'
      const zone = zoneForStatus(status)
      avatar.setStatus(status)
      if (!this.initialized) {
        const spot = this.target(id, i, zone)
        if (spot) {
          avatar.teleport(this.spotPoint(spot), spot.sit)
          this.tiles.set(id, spot.tile)
        }
        avatar.sprite.setVisible(true)
        this.zones.set(id, zone)
        return
      }
      if (this.zones.get(id) !== zone) {
        this.zones.set(id, zone)
        const spot = this.target(id, i, zone)
        if (spot) this.walkTo(avatar, spot)
      }
    })
    this.initialized = true
  }

  /** Workstation for 'workstation', otherwise a free spot in the area. */
  private target(agentId: string, agentIndex: number, zone: ZoneKind, exclude?: string): Spot | null {
    if (zone === 'workstation') {
      this.allocator.release(agentId)
      return this.workstation(agentId)
    }
    const spot = this.allocator.allocate(agentId, agentIndex, zone, exclude)
    if (!spot) console.warn(`[agent-npc] no free spot in ${zone} for ${agentId}`)
    return spot
  }

  private workstation(agentId: string): Spot {
    return workstationSpot(this.grid, this.seats, this.layout, agentId)
  }

  private spotPoint(spot: Spot): PixelPoint {
    return spot.sit ? { x: spot.x, y: spot.y } : { x: spot.x, y: spot.y + STANDING_Y_OFFSET }
  }

  private walkTo(avatar: AgentAvatar, spot: Spot): void {
    const s = avatar.sprite
    // Prefer the tracked tile: deriving it from pixels can land in an isolated
    // pocket (e.g. between desk partitions) when the agent is seated.
    const here =
      this.tiles.get(avatar.agentId) ??
      nearestWalkable(this.grid, {
        x: Math.floor(s.x / this.grid.tileSize),
        y: Math.floor((s.y - STANDING_Y_OFFSET) / this.grid.tileSize),
      })
    const path = here ? findPath(this.grid, here, spot.tile) : null
    this.tiles.set(avatar.agentId, spot.tile)
    if (!path) {
      // Recovery: never leave an agent stranded in the wrong zone.
      console.warn(`[agent-npc] no path for ${avatar.agentId}; repositioning`)
      avatar.teleport(this.spotPoint(spot), spot.sit)
      return
    }
    const waypoints = compressPath(path).map((t) => {
      const c = tileCenter(this.grid, t)
      return { x: c.x, y: c.y + STANDING_Y_OFFSET }
    })
    waypoints.push(this.spotPoint(spot))
    avatar.walk(waypoints, spot.sit)
  }

  /** Cheap idle behaviour: idle agents occasionally stroll inside the lounge. */
  private wander(): void {
    let index = 0
    this.avatars.forEach((avatar, id) => {
      const i = index++
      if (this.zones.get(id) !== 'lounge' || avatar.moving) return
      if (this.random() > IDLE_WANDER_PROBABILITY) return
      const current = this.allocator.spotOf(id)
      const spot = this.allocator.allocate(id, i + Math.floor(this.random() * 50), 'lounge', current)
      if (spot) this.walkTo(avatar, spot)
    })
  }
}
