import Phaser from 'phaser'

import layout from '../digital-company/officeLayout.json'

/**
 * Character sheet layout (32x48 frames, one row of 52):
 * idle right/up/left/down (6 each), run right/up/left/down (6 each),
 * then sit down/left/right/up (1 each).
 */
const DIRECTIONS = ['right', 'up', 'left', 'down'] as const
const SIT_DIRECTIONS = ['down', 'left', 'right', 'up'] as const
export const FRAME_WIDTH = 32
export const FRAME_HEIGHT = 48
export const FRAMES_PER_SHEET = 52

/** Unique textures used by the Office roster (officeLayout.json is the source of truth). */
export const CHARACTER_TEXTURES: string[] = Array.from(
  new Set(Object.keys(layout.agents).map((id) => (layout.agents as Record<string, { texture: string }>)[id].texture))
)

export const createCharacterAnims = (anims: Phaser.Animations.AnimationManager, textures = CHARACTER_TEXTURES) => {
  const frameRate = 15
  for (const key of textures) {
    DIRECTIONS.forEach((dir, i) => {
      anims.create({
        key: `${key}_idle_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: i * 6, end: i * 6 + 5 }),
        repeat: -1,
        frameRate: frameRate * 0.6,
      })
      anims.create({
        key: `${key}_run_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: 24 + i * 6, end: 24 + i * 6 + 5 }),
        repeat: -1,
        frameRate,
      })
    })
    SIT_DIRECTIONS.forEach((dir, i) => {
      anims.create({
        key: `${key}_sit_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: 48 + i, end: 48 + i }),
        repeat: 0,
        frameRate,
      })
    })
  }
}
