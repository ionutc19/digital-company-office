import { test } from 'node:test'
import { strict as assert } from 'assert'

import { aggregateFinOps, DashboardUsage, parseDashboardUsage, totalsOf } from './finops'

const usage = (calls: number, model = 'nvidia/nemotron-3-ultra-550b-a55b:free', day = '2026-11-14'): DashboardUsage => ({
  daily: [{ day, api_calls: calls, input_tokens: calls * 100, output_tokens: calls * 10, estimated_cost: 0 }],
  by_model: [{ model, input_tokens: calls * 100, output_tokens: calls * 10, estimated_cost: 0, api_calls: calls, sessions: 1 }],
  totals: { total_input: calls * 100, total_output: calls * 10, total_estimated_cost: 0, total_actual_cost: 0, total_sessions: 1, total_api_calls: calls },
})

test('rejects unexpected analytics payloads', () => {
  assert.throws(() => parseDashboardUsage(null))
  assert.throws(() => parseDashboardUsage({ daily: [], by_model: [] }))
  assert.ok(parseDashboardUsage(usage(1)))
})

test('totals tolerate missing or null fields', () => {
  const t = totalsOf({ daily: [], by_model: [], totals: { total_input: null, total_api_calls: 3 } })
  assert.equal(t.inputTokens, 0)
  assert.equal(t.apiCalls, 3)
})

test('aggregates fleet, per-agent, per-model and per-day usage', () => {
  const per = new Map<string, DashboardUsage | Error>([
    ['default', usage(2)],
    ['john-tdm', usage(5)],
    ['finops-lead', usage(3, 'google/gemini-flash', '2026-11-13')],
    ['qa-validator', new Error('Dashboard HTTP 500')],
  ])
  const r = aggregateFinOps(7, per)
  assert.equal(r.fleet.apiCalls, 10)
  assert.equal(r.agents.find((a) => a.id === 'john')!.totals!.apiCalls, 5)
  assert.equal(r.agents.find((a) => a.id === 'psyduck')!.error, 'Dashboard HTTP 500')
  assert.equal(r.agents.find((a) => a.id === 'goku')!.totals, null)
  assert.deepEqual(r.models.map((m) => [m.model, m.apiCalls]), [['nvidia/nemotron-3-ultra-550b-a55b:free', 7], ['google/gemini-flash', 3]])
  assert.deepEqual(r.daily.map((d) => [d.day, d.apiCalls]), [['2026-11-13', 3], ['2026-11-14', 7]])
})
