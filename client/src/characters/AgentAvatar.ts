import Phaser from 'phaser'

/** Same offsets as the original SkyOffice player sitting animation. */
const sittingShiftData = {
  up: [0, 3, -10],
  down: [0, 3, 1],
  left: [0, -8, 10],
  right: [0, -8, 10],
} as const

/**
 * Local, non-networked NPC representing one Digital Company agent.
 *
 * Deliberately independent from Player/OtherPlayer: no Colyseus session, no
 * WebRTC, no physics body. It only renders a character, a name/status label
 * and walks along a precomputed path. All decisions come from
 * AgentNpcManager, which is driven by live Hermes Kanban status.
 */

export const AGENT_STATUS_COLORS: Record<string, number> = {
  working: 0x22c55e,
  reviewing: 0x3b82f6,
  waiting: 0xeab308,
  blocked: 0xef4444,
  'human-approval': 0xa855f7,
  idle: 0x94a3b8,
  offline: 0x475569,
}

export interface PixelPoint {
  x: number
  y: number
}

type Direction = 'up' | 'down' | 'left' | 'right'

const WALK_SPEED_PX_PER_S = 110
/** Standing sprites are drawn with their centre above the tile so feet sit inside it. */
export const STANDING_Y_OFFSET = -12

/** Height of one stacked label row (LABEL_HEIGHT + LABEL_GAP in labelLayout.ts). */
const LABEL_ROW = 18

const OVERLAY_SELECTOR = 'button, a, input, textarea, select, aside, section, [role="dialog"], [data-dc-overlay]'

function startedOnOverlay(target: unknown): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null
}

export default class AgentAvatar {
  readonly agentId: string
  readonly sprite: Phaser.GameObjects.Sprite
  private readonly label: Phaser.GameObjects.Container
  private readonly nameText: Phaser.GameObjects.Text
  private readonly statusDot: Phaser.GameObjects.Arc
  private readonly texture: string
  private walkTween?: Phaser.Tweens.Tween
  private walkToken = 0
  private currentStatus = 'idle'
  private labelLevel = 0
  moving = false

  constructor(
    private readonly scene: Phaser.Scene,
    opts: { agentId: string; name: string; role: string; texture: string; tint: number; x: number; y: number }
  ) {
    this.agentId = opts.agentId
    this.texture = opts.texture
    this.sprite = scene.add.sprite(opts.x, opts.y, opts.texture)
    this.sprite.setTint(opts.tint)
    this.sprite.setDepth(opts.y)
    this.sprite.anims.play(`${opts.texture}_idle_down`, true)
    this.sprite.setInteractive({ useHandCursor: true })
    this.sprite.setData('agentId', opts.agentId)

    this.nameText = scene.add
      .text(6, 0, opts.name, { fontFamily: 'Arial', fontSize: '11px', color: '#111111' })
      .setOrigin(0, 0.5)
    this.statusDot = scene.add.circle(0, 0, 4, AGENT_STATUS_COLORS.idle).setStrokeStyle(1, 0x111111)
    const width = this.nameText.width + 14
    const bg = scene.add.rectangle(-6, 0, width, 16, 0xffffff, 0.85).setOrigin(0, 0.5).setStrokeStyle(1, 0x94a3b8)
    this.label = scene.add.container(opts.x - width / 2 + 6, opts.y - 30, [bg, this.statusDot, this.nameText])
    this.label.setDepth(5000)
    this.label.setName(`${opts.role}`)
  }

  setStatus(status: string): void {
    this.currentStatus = status
    this.statusDot.setFillStyle(AGENT_STATUS_COLORS[status] ?? AGENT_STATUS_COLORS.idle)
    const offline = status === 'offline'
    this.sprite.setAlpha(offline ? 0.45 : 1)
    this.label.setAlpha(offline ? 0.6 : 1)
  }

  get status(): string {
    return this.currentStatus
  }

  /** Initialization / recovery only: place without walking. */
  teleport(target: PixelPoint, sit?: Direction): void {
    this.stopWalking()
    this.sprite.setPosition(target.x, target.y)
    this.syncLabel()
    this.settle(sit)
  }

  /**
   * Walks through the waypoints (pixel centres), then settles at the final
   * point, sitting when `sit` is provided. A newer walk cancels an older one.
   */
  walk(waypoints: PixelPoint[], sit?: Direction, onArrive?: () => void): void {
    this.stopWalking()
    const token = ++this.walkToken
    const points = waypoints.filter(
      (p, i) => i === 0 || p.x !== waypoints[i - 1].x || p.y !== waypoints[i - 1].y
    )
    if (points.length === 0) {
      this.settle(sit)
      onArrive?.()
      return
    }
    this.moving = true
    const step = (i: number) => {
      if (token !== this.walkToken) return
      if (i >= points.length) {
        this.moving = false
        this.settle(sit)
        onArrive?.()
        return
      }
      const target = points[i]
      const dx = target.x - this.sprite.x
      const dy = target.y - this.sprite.y
      const distance = Math.hypot(dx, dy)
      if (distance < 1) {
        step(i + 1)
        return
      }
      const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      this.sprite.anims.play(`${this.texture}_run_${dir}`, true)
      this.walkTween = this.scene.tweens.add({
        targets: this.sprite,
        x: target.x,
        y: target.y,
        duration: (distance / WALK_SPEED_PX_PER_S) * 1000,
        ease: 'Linear',
        onUpdate: () => this.syncLabel(),
        onComplete: () => step(i + 1),
      })
    }
    step(0)
  }

  stopWalking(): void {
    this.walkToken++
    this.walkTween?.stop()
    this.walkTween = undefined
    this.moving = false
  }

  onClick(handler: (agentId: string) => void): void {
    this.sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Phaser listens on the window, so it also sees clicks made on HTML panels
      // laid over the canvas. Ignore clicks that started on interactive UI.
      if (startedOnOverlay(pointer.downElement)) return
      handler(this.agentId)
    })
  }

  destroy(): void {
    this.stopWalking()
    this.sprite.destroy()
    this.label.destroy()
  }

  private settle(sit?: Direction): void {
    if (sit) {
      this.sprite.anims.play(`${this.texture}_sit_${sit}`, true)
      this.sprite.setDepth(this.sprite.y + sittingShiftData[sit][2])
    } else {
      this.sprite.anims.play(`${this.texture}_idle_down`, true)
      this.sprite.setDepth(this.sprite.y)
    }
    this.syncLabel()
  }

  /** Label width in pixels (for overlap layout). */
  get labelWidth(): number {
    return this.nameText.width + 14
  }

  /** Raise the label by `level` rows so it does not cover a neighbour's label. */
  setLabelLevel(level: number): void {
    if (level === this.labelLevel) return
    this.labelLevel = level
    this.syncLabel()
  }

  private syncLabel(): void {
    const width = this.nameText.width + 14
    this.label.setPosition(this.sprite.x - width / 2 + 6, this.sprite.y - 30 - this.labelLevel * LABEL_ROW)
    if (this.moving) this.sprite.setDepth(this.sprite.y)
  }
}
