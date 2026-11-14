/** Live Kanban event subscriber (WebSocket); pure helpers live in shared/. */
import WebSocket = require('ws')

import { EventBuffer, parseStreamMessage } from '../../shared/digital-company/activity'
import { DASHBOARD_URL, readDashboardToken } from './dashboardAuth'

export * from '../../shared/digital-company/activity'

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
