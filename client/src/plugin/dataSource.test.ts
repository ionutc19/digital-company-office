import { test } from 'node:test'
import { strict as assert } from 'assert'

import { createPluginBackend } from './dataSource'

const now = 1763100000
const tasks = [
  { id: 'b1', title: 'Pick SKU', assignee: 'finops-lead', status: 'blocked', project_id: 'DC-0001', last_failure_error: null, created_at: now, started_at: now },
  { id: 'r1', title: 'Review VNet', assignee: 'technical-supervisor', status: 'review', project_id: 'DC-0001', last_failure_error: null, created_at: now, started_at: now },
]
const md = 'Project ID: DC-0001\n\n## ITSM Classification\n\nType:\nCHANGE\n\n## Compliance Profile\n\nGDPR:\nAPPLICABLE\n'

function fakeFetch(fail = false) {
  const calls: string[] = []
  const fn = async (url: string) => {
    calls.push(url)
    if (fail) throw new Error('HTTP 503')
    const u = new URL(url, 'http://x')
    switch (u.pathname) {
      case '/api/plugins/digital-company/tasks':
        return { tasks }
      case '/api/plugins/digital-company/blocked-events':
        return { byTask: { b1: [{ kind: 'blocked', payload: { reason: 'HUMAN_APPROVAL [budget]: SKU?', kind: 'needs_input' } }] } }
      case '/api/plugins/digital-company/projects':
        return { projects: [{ dir: 'DC-0001', file: 'projects/DC-0001/PROJECT.md', text: md }], error: null }
      case '/api/plugins/digital-company/usage':
        return {
          byProfile: {
            default: { daily: [], by_model: [], totals: { total_api_calls: 1 } },
            'john-tdm': { daily: [{ day: '2026-11-14', api_calls: 4 }], by_model: [], totals: { total_api_calls: 4 } },
            'qa-validator': { error: 'profile db missing' },
          },
        }
      case '/api/plugins/digital-company/events': {
        const since = Number(u.searchParams.get('since'))
        return since === 0
          ? { events: [{ id: 1, task_id: 'b1', run_id: null, kind: 'blocked', payload: { reason: 'HUMAN_APPROVAL [budget]: SKU?' }, created_at: now }], cursor: 1 }
          : { events: [], cursor: since }
      }
      default:
        throw new Error(`unexpected ${u.pathname}`)
    }
  }
  return { fn, calls }
}

test('computes agent states with approvals in the browser', async () => {
  const { fn } = fakeFetch()
  const api = createPluginBackend(fn)
  const r = (await api('/agents')) as { agents: Array<{ id: string; status: string }> }
  const by = Object.fromEntries(r.agents.map((a) => [a.id, a.status]))
  assert.equal(by.piccolo, 'human-approval')
  assert.equal(by.john, 'human-approval')
  assert.equal(by.goku, 'reviewing')
})

test('snapshot is cached across panels', async () => {
  const { fn, calls } = fakeFetch()
  const api = createPluginBackend(fn)
  await Promise.all([api('/agents'), api('/overview'), api('/agents/piccolo')])
  assert.equal(calls.filter((c) => c.endsWith('/tasks')).length, 1)
})

test('overview, detail, compliance, itsm, finops and activity routes', async () => {
  const { fn } = fakeFetch()
  const api = createPluginBackend(fn)
  const o = (await api('/overview')) as { approvals: Array<{ taskId: string }>; review: unknown[] }
  assert.deepEqual(o.approvals.map((a) => a.taskId), ['b1'])
  assert.equal(o.review.length, 1)
  const d = (await api('/agents/piccolo')) as { recentTasks: unknown[] }
  assert.equal(d.recentTasks.length, 1)
  await assert.rejects(api('/agents/nobody'), /Unknown agent/)
  const c = (await api('/compliance')) as { projects: Array<{ frameworks: { GDPR: { status: string } } }> }
  assert.equal(c.projects[0].frameworks.GDPR.status, 'APPLICABLE')
  const i = (await api('/itsm')) as { rooms: Array<{ type: string; projects: unknown[] }> }
  assert.equal(i.rooms.find((r) => r.type === 'CHANGE')!.projects.length, 1)
  const f = (await api('/finops?days=7')) as { available: boolean; fleet: { apiCalls: number }; agents: Array<{ id: string; error?: string }> }
  assert.equal(f.available, true)
  assert.equal(f.fleet.apiCalls, 5)
  assert.equal(f.agents.find((a) => a.id === 'psyduck')!.error, 'profile db missing')
  const a = (await api('/activity?limit=10')) as { connected: boolean; events: Array<{ agentName: string; summary: string }> }
  assert.equal(a.connected, true)
  assert.match(a.events[0].summary, /asked Ionut for a decision/)
  assert.equal(a.events[0].agentName, 'Piccolo')
})

test('backend failure surfaces as Hermes unavailable (OFFLINE)', async () => {
  const { fn } = fakeFetch(true)
  const api = createPluginBackend(fn)
  await assert.rejects(api('/agents'), /Hermes Kanban is unavailable/)
  const f = (await api('/finops?days=7')) as { available: boolean }
  assert.equal(f.available, false)
  const a = (await api('/activity')) as { connected: boolean }
  assert.equal(a.connected, false)
})
