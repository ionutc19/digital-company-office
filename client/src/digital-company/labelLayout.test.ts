import { test } from 'node:test'
import { strict as assert } from 'assert'

import { layoutLabels, MAX_LEVELS } from './labelLayout'

test('separate agents keep their label in place', () => {
  const levels = layoutLabels([
    { id: 'a', x: 100, y: 100, width: 60 },
    { id: 'b', x: 300, y: 100, width: 60 },
  ])
  assert.equal(levels.get('a'), 0)
  assert.equal(levels.get('b'), 0)
})

test('overlapping labels are stacked, never sharing a row', () => {
  const boxes = ['john', 'goku', 'bulma', 'piccolo'].map((id, i) => ({ id, x: 200 + i * 8, y: 200, width: 70 }))
  const levels = layoutLabels(boxes)
  assert.deepEqual(Array.from(new Set(Array.from(levels.values()))).sort(), [0, 1, 2, 3])
})

test('layout is deterministic regardless of input order', () => {
  const boxes = [
    { id: 'a', x: 100, y: 100, width: 60 },
    { id: 'b', x: 110, y: 104, width: 60 },
    { id: 'c', x: 95, y: 98, width: 60 },
  ]
  const one = layoutLabels(boxes)
  const two = layoutLabels([...boxes].reverse())
  assert.deepEqual(Array.from(one.entries()).sort(), Array.from(two.entries()).sort())
})

test('stacking is bounded', () => {
  const boxes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, x: 100, y: 100, width: 60 }))
  const levels = layoutLabels(boxes)
  assert.ok(Math.max(...levels.values()) <= MAX_LEVELS)
})
