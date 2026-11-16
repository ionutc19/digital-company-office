/** I/O half of FinOps (local Dashboard analytics); aggregation lives in shared/. */
import * as http from 'http'

import { aggregateFinOps, DashboardUsage, FinOpsReport, parseDashboardUsage } from '../../shared/digital-company/finops'
import { AGENTS } from './status'
import { DASHBOARD_URL, readDashboardToken } from './dashboardAuth'

export * from '../../shared/digital-company/finops'

// ---------------------------------------------------------------------------
// I/O: fetch from the local Dashboard with a short timeout and a cache.

const CACHE_MS = Number(process.env.DC_FINOPS_CACHE_MS || 60000)
const TIMEOUT_MS = 10000
const readToken = readDashboardToken

function fetchUsage(token: string, days: number, profile: string | null): Promise<DashboardUsage> {
  const qs = new URLSearchParams({ days: String(days) })
  if (profile) qs.set('profile', profile)
  const url = new URL(`${DASHBOARD_URL}/api/analytics/usage?${qs}`)
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      { headers: { 'X-Hermes-Session-Token': token }, timeout: TIMEOUT_MS },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error('Dashboard rejected the session token (restart with ops\\restart-company.ps1)'))
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Dashboard HTTP ${res.statusCode}`))
            return
          }
          try {
            resolve(parseDashboardUsage(JSON.parse(body)))
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('Dashboard request timed out')))
    req.on('error', (e) => reject(e))
  })
}

export type FinOpsResult =
  | ({ available: true; generatedAt: string } & FinOpsReport)
  | { available: false; reason: string; generatedAt: string }

const cache = new Map<number, { at: number; value: FinOpsResult }>()

export async function loadFinOps(days: number): Promise<FinOpsResult> {
  const hit = cache.get(days)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const now = new Date().toISOString()
  const token = readToken()
  let value: FinOpsResult
  if (!token) {
    value = {
      available: false,
      reason: 'No Dashboard session token. Start the company with ops\\start-company.ps1 so the Office can read Hermes analytics.',
      generatedAt: now,
    }
  } else {
    const perProfile = new Map<string, DashboardUsage | Error>()
    const profiles = [null as string | null, ...AGENTS.map((a) => a.profile)]
    const results = await Promise.all(
      profiles.map((p) => fetchUsage(token, days, p).then((u) => u, (e: Error) => e))
    )
    results.forEach((r, i) => perProfile.set(profiles[i] ?? 'default', r))
    const errors = results.filter((r) => r instanceof Error) as Error[]
    if (errors.length === results.length) {
      value = { available: false, reason: errors[0].message || 'Hermes Dashboard is unreachable', generatedAt: now }
    } else {
      value = { available: true, generatedAt: now, ...aggregateFinOps(days, perProfile) }
    }
  }
  cache.set(days, { at: Date.now(), value })
  return value
}
