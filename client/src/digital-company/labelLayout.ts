/**
 * Pure label placement for agent NPCs: labels that would overlap are stacked
 * upwards so every name stays readable when several agents share a room.
 */
export interface LabelBox {
  id: string
  /** Sprite centre. */
  x: number
  y: number
  width: number
}

export const LABEL_HEIGHT = 16
export const LABEL_GAP = 2
export const MAX_LEVELS = 6

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * Returns, for each label, how many levels (of LABEL_HEIGHT + LABEL_GAP px)
 * it must be raised. Deterministic: lower sprites are placed first, ties by x
 * then id, so labels do not jitter between frames.
 */
export function layoutLabels(boxes: LabelBox[], baseOffset = -30): Map<string, number> {
  const ordered = [...boxes].sort((a, b) => b.y - a.y || a.x - b.x || a.id.localeCompare(b.id))
  const placed: Rect[] = []
  const levels = new Map<string, number>()
  for (const b of ordered) {
    let level = 0
    let rect: Rect
    for (;;) {
      const centreY = b.y + baseOffset - level * (LABEL_HEIGHT + LABEL_GAP)
      rect = { left: b.x - b.width / 2, right: b.x + b.width / 2, top: centreY - LABEL_HEIGHT / 2, bottom: centreY + LABEL_HEIGHT / 2 }
      if (level >= MAX_LEVELS || !placed.some((p) => overlaps(p, rect))) break
      level++
    }
    placed.push(rect)
    levels.set(b.id, level)
  }
  return levels
}
