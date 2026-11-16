import Phaser from 'phaser'

import { createCharacterAnims } from '../anims/CharacterAnims'
import AgentNpcManager from '../digital-company/AgentNpcManager'
import { TiledMap } from '../digital-company/officeGrid'

/** Object layer -> spritesheet key and Tiled tileset name (mirrors scenes/Game.ts). */
const OBJECT_LAYERS: Array<{ layer: string; key: string; tileset: string; depthBoost?: number }> = [
  { layer: 'Wall', key: 'tiles_wall', tileset: 'FloorAndGround' },
  { layer: 'Chair', key: 'chairs', tileset: 'chair' },
  { layer: 'Computer', key: 'computers', tileset: 'computer', depthBoost: 0.27 },
  { layer: 'Whiteboard', key: 'whiteboards', tileset: 'whiteboard' },
  { layer: 'VendingMachine', key: 'vendingmachines', tileset: 'vendingmachine' },
  { layer: 'Objects', key: 'office', tileset: 'Modern_Office_Black_Shadow' },
  { layer: 'ObjectsOnCollide', key: 'office', tileset: 'Modern_Office_Black_Shadow' },
  { layer: 'GenericObjects', key: 'generic', tileset: 'Generic' },
  { layer: 'GenericObjectsOnCollide', key: 'generic', tileset: 'Generic' },
  { layer: 'Basement', key: 'basement', tileset: 'Basement' },
]

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5

/**
 * Read-only office view for the Hermes Dashboard tab: the full map and the
 * 11 agent NPCs. No human player, no Colyseus, no WebRTC/PeerJS. Drag to pan,
 * wheel to zoom, click an agent for details.
 */
export default class OfficeViewScene extends Phaser.Scene {
  constructor(private readonly assetBase: string) {
    super('office-view')
  }

  preload() {
    this.load.setBaseURL(this.assetBase)
    this.load.tilemapTiledJSON('tilemap', 'map/map.json')
    const sheets: Array<[string, string, number, number]> = [
      ['tiles_wall', 'map/FloorAndGround.png', 32, 32],
      ['chairs', 'items/chair.png', 32, 64],
      ['computers', 'items/computer.png', 96, 64],
      ['whiteboards', 'items/whiteboard.png', 64, 64],
      ['vendingmachines', 'items/vendingmachine.png', 48, 72],
      ['office', 'tileset/Modern_Office_Black_Shadow.png', 32, 32],
      ['basement', 'tileset/Basement.png', 32, 32],
      ['generic', 'tileset/Generic.png', 32, 32],
      ['adam', 'character/adam.png', 32, 48],
      ['ash', 'character/ash.png', 32, 48],
      ['lucy', 'character/lucy.png', 32, 48],
      ['nancy', 'character/nancy.png', 32, 48],
    ]
    sheets.forEach(([key, url, frameWidth, frameHeight]) => this.load.spritesheet(key, url, { frameWidth, frameHeight }))
  }

  create() {
    createCharacterAnims(this.anims)
    const map = this.make.tilemap({ key: 'tilemap' })
    const floor = map.addTilesetImage('FloorAndGround', 'tiles_wall')
    map.createLayer('Ground', floor)

    for (const { layer, key, tileset, depthBoost } of OBJECT_LAYERS) {
      const objects = map.getObjectLayer(layer)?.objects || []
      const firstgid = map.getTileset(tileset)?.firstgid ?? 0
      for (const o of objects) {
        if (!o.gid) continue
        const x = o.x! + o.width! * 0.5
        const y = o.y! - o.height! * 0.5
        const img = this.add.image(x, y, key, o.gid - firstgid)
        img.setDepth(depthBoost ? y + img.height * depthBoost : y)
      }
    }

    new AgentNpcManager(this, this.cache.tilemap.get('tilemap').data as TiledMap)

    // Camera: fit the map, then drag to pan and wheel to zoom.
    const cam = this.cameras.main
    cam.setBackgroundColor('#0f172a')
    cam.setBounds(-200, -200, map.widthInPixels + 400, map.heightInPixels + 400)
    const fit = () => {
      const z = Math.min(this.scale.width / map.widthInPixels, this.scale.height / map.heightInPixels)
      cam.setZoom(Phaser.Math.Clamp(z, MIN_ZOOM, MAX_ZOOM))
      cam.centerOn(map.widthInPixels / 2, map.heightInPixels / 2)
    }
    fit()
    this.scale.on(Phaser.Scale.Events.RESIZE, fit)

    let dragging = false
    this.input.on('pointerdown', () => (dragging = true))
    this.input.on('pointerup', () => (dragging = false))
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging || !p.isDown) return
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom
    })
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM))
    })
  }
}
