/**
 * FinOps data for Piccolo, read from the Hermes Dashboard's own analytics
 * endpoint (`GET /api/analytics/usage?days=&profile=`), the same source as the
 * Dashboard "Models" page. No LLM calls, no direct access to Hermes databases.
 *
 * The Dashboard requires its session token. ops/start-company.ps1 pins it via
 * HERMES_DASHBOARD_SESSION_TOKEN and stores it in a user-only file whose path
 * is passed as DC_DASHBOARD_TOKEN_FILE. Without it, FinOps reports
 * "unavailable" with a reason instead of inventing numbers.
 */

import { AGENTS } from './status'

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  actualCost: number
  sessions: number
  apiCalls: number
}

export interface DashboardUsage {
  daily: Array<Record<string, unknown>>
  by_model: Array<Record<string, unknown>>
  totals: Record<string, unknown>
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const emptyTotals = (): UsageTotals => ({ inputTokens: 0, outputTokens: 0, estimatedCost: 0, actualCost: 0, sessions: 0, apiCalls: 0 })
const add = (a: UsageTotals, b: UsageTotals): UsageTotals => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  estimatedCost: a.estimatedCost + b.estimatedCost,
  actualCost: a.actualCost + b.actualCost,
  sessions: a.sessions + b.sessions,
  apiCalls: a.apiCalls + b.apiCalls,
})

/** Validates the Dashboard payload shape; throws on anything unexpected. */
export function parseDashboardUsage(payload: unknown): DashboardUsage {
  const p = payload as Partial<DashboardUsage>
  if (!p || typeof p !== 'object' || !Array.isArray(p.daily) || !Array.isArray(p.by_model) || !p.totals || typeof p.totals !== 'object') {
    throw new Error('Unexpected Hermes analytics payload')
  }
  return p as DashboardUsage
}

export function totalsOf(u: DashboardUsage): UsageTotals {
  const t = u.totals
  return {
    inputTokens: num(t.total_input),
    outputTokens: num(t.total_output),
    estimatedCost: num(t.total_estimated_cost),
    actualCost: num(t.total_actual_cost),
    sessions: num(t.total_sessions),
    apiCalls: num(t.total_api_calls),
  }
}

export interface FinOpsReport {
  periodDays: number
  fleet: UsageTotals
  agents: Array<{ id: string; name: string; profile: string; totals: UsageTotals | null; error?: string }>
  models: Array<{ model: string; inputTokens: number; outputTokens: number; estimatedCost: number; apiCalls: number; sessions: number }>
  daily: Array<{ day: string; apiCalls: number; inputTokens: number; outputTokens: number; estimatedCost: number }>
}

/** Pure aggregation across profiles (default profile counted as 'default'). */
export function aggregateFinOps(
  periodDays: number,
  perProfile: Map<string, DashboardUsage | Error>
): FinOpsReport {
  let fleet = emptyTotals()
  const models = new Map<string, FinOpsReport['models'][number]>()
  const daily = new Map<string, FinOpsReport['daily'][number]>()

  perProfile.forEach((usage) => {
    if (usage instanceof Error) return
    fleet = add(fleet, totalsOf(usage))
    for (const r of usage.by_model) {
      const name = typeof r.model === 'string' && r.model ? r.model : 'unknown'
      const m = models.get(name) || { model: name, inputTokens: 0, outputTokens: 0, estimatedCost: 0, apiCalls: 0, sessions: 0 }
      m.inputTokens += num(r.input_tokens)
      m.outputTokens += num(r.output_tokens)
      m.estimatedCost += num(r.estimated_cost)
      m.apiCalls += num(r.api_calls)
      m.sessions += num(r.sessions)
      models.set(name, m)
    }
    for (const r of usage.daily) {
      if (typeof r.day !== 'string') continue
      const d = daily.get(r.day) || { day: r.day, apiCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0 }
      d.apiCalls += num(r.api_calls)
      d.inputTokens += num(r.input_tokens)
      d.outputTokens += num(r.output_tokens)
      d.estimatedCost += num(r.estimated_cost)
      daily.set(r.day, d)
    }
  })

  const agents = AGENTS.map((a) => {
    const u = perProfile.get(a.profile)
    if (!u) return { id: a.id, name: a.name, profile: a.profile, totals: null, error: 'not loaded' }
    if (u instanceof Error) return { id: a.id, name: a.name, profile: a.profile, totals: null, error: u.message }
    return { id: a.id, name: a.name, profile: a.profile, totals: totalsOf(u) }
  })

  return {
    periodDays,
    fleet,
    agents,
    models: Array.from(models.values()).sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    daily: Array.from(daily.values()).sort((a, b) => a.day.localeCompare(b.day)),
  }
}
