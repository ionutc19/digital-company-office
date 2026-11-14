import { test } from 'node:test'
import { strict as assert } from 'assert'
import WebSocket = require('ws')

import { ActivityFeed, describeEvent, EventBuffer, KanbanEvent, MAX_EVENTS, parseStreamMessage } from './activity'

const ev = (id: number, kind = 'created', payload: Record<string, unknown> | null = null): KanbanEvent => ({
  id, task_id: `t${id}`, run_id: null, kind, payload, created_at: 1700000000 + id,
})

test('describes events, including HUMAN_APPROVAL blocks', () => {
  assert.equal(describeEvent('created', null), 'created the task')
  assert.equal(describeEvent('blocked', { reason: 'HUMAN_APPROVAL [budget]: pick SKU' }), 'asked Ionut for a decision: [budget]: pick SKU')
  assert.equal(describeEvent('blocked', { reason: 'waiting on circuit id' }), 'blocked: waiting on circuit id')
  assert.equal(describeEvent('completed', { summary: 'Terraform validated' }), 'completed: Terraform validated')
  assert.equal(describeEvent('some_new_kind', null), 'some new kind')
  assert.ok(describeEvent('blocked', { reason: 'x'.repeat(500) }).length < 160)
})

test('validates stream messages', () => {
  assert.equal(parseStreamMessage('not json'), null)
  assert.equal(parseStreamMessage('{"events":[]}'), null)
  const m = parseStreamMessage(JSON.stringify({ cursor: 3, events: [ev(1), { id: 'x' }, ev(3)] }))!
  assert.equal(m.cursor, 3)
  assert.deepEqual(m.events.map((e) => e.id), [1, 3])
})

test('buffer de-duplicates, orders and is bounded', () => {
  const b = new EventBuffer()
  b.add([ev(2), ev(1), ev(2)])
  assert.deepEqual(b.newest(10).map((e) => e.id), [2, 1])
  b.add(Array.from({ length: MAX_EVENTS + 10 }, (_, i) => ev(i + 3)))
  assert.equal(b.newest(10000).length, MAX_EVENTS)
  assert.equal(b.lastId, MAX_EVENTS + 12)
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('feed connects with the token, replays history and resumes after reconnect', async () => {
  const seen: string[] = []
  const server = new WebSocket.Server({ port: 0, host: '127.0.0.1' })
  await new Promise((r) => server.on('listening', r))
  const port = ((server as unknown as { address(): { port: number } }).address()).port
  let connections = 0
  server.on('connection', (socket: any, req: any) => {
    const url = new URL(req.url, 'http://x')
    seen.push(url.search)
    if (url.searchParams.get('token') !== 'good') {
      socket.close(1008)
      return
    }
    connections++
    const since = Number(url.searchParams.get('since'))
    if (since === 0) {
      socket.send(JSON.stringify({ cursor: 2, events: [ev(1), ev(2, 'blocked', { reason: 'HUMAN_APPROVAL [security]: open 443?' })] }))
      setTimeout(() => socket.terminate(), 50) // drop the connection once
    } else {
      socket.send(JSON.stringify({ cursor: 3, events: [ev(3, 'completed')] }))
    }
  })

  const url = `ws://127.0.0.1:${port}/api/plugins/kanban/events`
  const feed = new ActivityFeed(url, () => 'good', 50)
  const bad = new ActivityFeed(url, () => 'wrong', 50)
  const none = new ActivityFeed(url, () => null, 50)
  try {
    feed.ensureStarted()
    await wait(800)
    assert.deepEqual(feed.buffer.newest(10).map((e) => e.id), [3, 2, 1])
    assert.ok(connections >= 2)
    assert.match(seen[1], /since=2/) // resumed from the cursor, no full replay

    bad.ensureStarted()
    await wait(200)
    assert.equal(bad.state.connected, false)
    assert.match(bad.state.lastError || '', /rejected the session token/)

    none.ensureStarted()
    assert.match(none.state.lastError || '', /No Dashboard session token/)
  } finally {
    feed.stop()
    bad.stop()
    none.stop()
  }
  await new Promise((r) => server.close(() => r(null)))
})
