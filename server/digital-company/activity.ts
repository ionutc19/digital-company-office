/**
 * Activity timeline from Hermes Kanban's official event stream: the Dashboard
 * kanban plugin WebSocket `/api/plugins/kanban/events?since=<id>&token=`.
 * One long-lived connection, resumed from the last event id after a
 * disconnect, keeping the newest MAX_EVENTS in memory. No polling of the CLI,
 * no LLM calls, no direct database access.
 */
import WebSocket = require('ws')

import { DASHBOARD_URL, readDashboardToken } from './dashboardAuth'

export interface KanbanEvent {
  id: number
  task_id: string
  run_id: number | null
  kind: string
  payload: Record<string, unknown> | null
  created_at: number
}

export const MAX_EVENTS = 500

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Human summary of one task event. Unknown kinds fall back to their name. */
export function describeEvent(kind: string, payload: Record<string, unknown> | null): string {
  const p = payload || {}
  switch (kind) {
    case 'created':
      return 'created the task'
    case 'promoted':
      return 'moved to ready'
    case 'promoted_manual':
      return 'promoted manually'
    case 'spawned':
      return 'worker spawned'
    case 'scheduled':
      return str(p.reason) ? `scheduled: ${clip(str(p.reason))}` : 'scheduled'
    case 'commented':
      return 'commented'
    case 'reclaimed':
      return 'task reclaimed'
    case 'reprioritized':
      return 'reprioritized'
    case 'attached':
      return 'attached a file'
    case 'linked':
      return 'linked to another task'
    case 'unlinked':
      return 'unlinked from another task'
    case 'claimed':
    case 'started':
      return 'started working'
    case 'blocked': {
      const reason = str(p.reason)
      if (/^\s*HUMAN_APPROVAL/i.test(reason)) return `asked Ionut for a decision: ${clip(reason.replace(/^\s*HUMAN_APPROVAL\s*/i, ''))}`
      return reason ? `blocked: ${clip(reason)}` : 'blocked'
    }
    case 'dependency_wait':
      return 'waiting for a dependency'
    case 'unblocked':
      return 'unblocked'
    case 'review_requested':
    case 'request_review':
      return 'requested review'
    case 'changes_requested':
      return str(p.reason) ? `changes requested: ${clip(str(p.reason))}` : 'changes requested'
    case 'completed':
      return str(p.summary) ? `completed: ${clip(str(p.summary))}` : 'completed the task'
    case 'archived':
      return 'archived'
    case 'reassigned':
      return str(p.to) ? `reassigned to ${str(p.to)}` : 'reassigned'
    case 'gave_up':
      return 'gave up'
    case 'crashed':
      return 'worker crashed'
    case 'timed_out':
      return 'timed out'
    case 'block_loop_detected':
      return 'block loop detected, sent to triage'
    case 'status':
      return str(p.to) ? `status changed to ${str(p.to)}` : 'status changed'
    case 'edited':
      return 'edited'
    case 'heartbeat':
      return str(p.note) ? `heartbeat: ${clip(str(p.note), 80)}` : 'heartbeat'
    default:
      return kind.replace(/_/g, ' ')
  }
}

/** Validates a stream message ({events, cursor}); invalid events are dropped. */
export function parseStreamMessage(raw: string): { cursor: number; events: KanbanEvent[] } | null {
  let msg: unknown
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  const m = msg as { events?: unknown; cursor?: unknown }
  if (!m || !Array.isArray(m.events) || typeof m.cursor !== 'number') return null
  const events = (m.events as Array<Record<string, unknown>>).filter(
    (e) => e && typeof e.id === 'number' && typeof e.task_id === 'string' && typeof e.kind === 'string'
  ) as unknown as KanbanEvent[]
  return { cursor: m.cursor, events }
}

/** Bounded, de-duplicated, id-ordered buffer. */
export class EventBuffer {
  private events: KanbanEvent[] = []
  private ids = new Set<number>()

  add(batch: KanbanEvent[]): void {
    for (const e of batch) {
      if (this.ids.has(e.id)) continue
      this.ids.add(e.id)
      this.events.push(e)
    }
    this.events.sort((a, b) => a.id - b.id)
    while (this.events.length > MAX_EVENTS) {
      const old = this.events.shift() as KanbanEvent
      this.ids.delete(old.id)
    }
  }

  newest(limit: number): KanbanEvent[] {
    return this.events.slice(-limit).reverse()
  }

  get lastId(): number {
    return this.events.length ? this.events[this.events.length - 1].id : 0
  }
}

type FeedState = { connected: boolean; lastError: string | null; startedAt: number | null }

/** Long-lived subscriber to the Kanban event WebSocket, started on first use. */
export class ActivityFeed {
  readonly buffer = new EventBuffer()
  private ws: WebSocket | null = null
  private cursor = 0
  private retryMs: number
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  state: FeedState = { connected: false, lastError: null, startedAt: null }

  constructor(
    private readonly url = DASHBOARD_URL.replace(/^http/, 'ws') + '/api/plugins/kanban/events',
    private readonly token: () => string | null = readDashboardToken,
    private readonly baseRetryMs = 2000
  ) {
    this.retryMs = baseRetryMs
  }

  ensureStarted(): void {
    if (this.state.startedAt !== null || this.stopped) return
    this.state.startedAt = Date.now()
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.terminate()
  }

  private connect(): void {
    if (this.stopped) return
    const token = this.token()
    if (!token) {
      this.state = { ...this.state, connected: false, lastError: 'No Dashboard session token (start the company with ops\\start-company.ps1)' }
      this.scheduleRetry()
      return
    }
    const qs = new URLSearchParams({ since: String(this.cursor), token })
    const ws = new WebSocket(`${this.url}?${qs}`, { handshakeTimeout: 10000 })
    this.ws = ws
    ws.on('open', () => {
      this.retryMs = this.baseRetryMs
      this.state = { ...this.state, connected: true, lastError: null }
    })
    ws.on('message', (data: unknown) => {
      const parsed = parseStreamMessage(String(data))
      if (!parsed) return
      this.buffer.add(parsed.events)
      this.cursor = Math.max(this.cursor, parsed.cursor)
    })
    ws.on('error', (err: Error) => {
      this.state = { ...this.state, lastError: err.message }
    })
    ws.on('close', (code: number) => {
      this.ws = null
      const policy = code === 1008 ? 'Dashboard rejected the session token (restart with ops\\restart-company.ps1)' : null
      this.state = { ...this.state, connected: false, lastError: policy || this.state.lastError || `connection closed (${code})` }
      this.scheduleRetry()
    })
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.connect(), this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, 30000)
  }
}
