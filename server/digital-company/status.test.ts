import { test } from 'node:test'
import { strict as assert } from 'assert'

import { activeTaskForProfile, approvalFromShow, buildOverview, recentTasksForProfile, buildAgentStates, mapStatus, parseKanbanTasks, AGENTS, HermesTask } from './status'

const task = (over: Partial<HermesTask>): HermesTask => ({
  id: 't1',
  title: 'Task',
  assignee: 'cloud-engineer',
  status: 'todo',
  project_id: null,
  last_failure_error: null,
  created_at: 1,
  started_at: null,
  ...over,
})

test('maps every Kanban status to the documented Office status', () => {
  assert.equal(mapStatus('running'), 'working')
  assert.equal(mapStatus('review'), 'reviewing')
  assert.equal(mapStatus('blocked'), 'blocked')
  for (const s of ['ready', 'todo', 'scheduled']) assert.equal(mapStatus(s), 'waiting')
  for (const s of ['done', 'archived', 'triage', undefined, null, 'unknown']) assert.equal(mapStatus(s), 'idle')
})

test('picks the highest-priority active task, then the most recent', () => {
  const tasks = [
    task({ id: 'a', status: 'todo', created_at: 10 }),
    task({ id: 'b', status: 'running', started_at: 5 }),
    task({ id: 'c', status: 'done', created_at: 99 }),
    task({ id: 'd', status: 'running', started_at: 7 }),
  ]
  assert.equal(activeTaskForProfile(tasks, 'cloud-engineer')?.id, 'd')
  assert.equal(activeTaskForProfile(tasks, 'qa-validator'), null)
})

test('ignores done, archived and triage tasks', () => {
  const tasks = [task({ status: 'done' }), task({ status: 'archived' }), task({ status: 'triage' })]
  assert.equal(activeTaskForProfile(tasks, 'cloud-engineer'), null)
})

test('validates untrusted CLI JSON', () => {
  assert.throws(() => parseKanbanTasks({ tasks: [] }))
  const { tasks, rejected } = parseKanbanTasks([
    task({ id: 'ok' }),
    { id: 42, title: 'bad id', status: 'todo' },
    null,
    { id: 'x', title: 'missing status' },
    { ...task({ id: 'extra' }), body: 'ignored', unknown_field: true },
  ])
  assert.deepEqual(tasks.map((t) => t.id), ['ok', 'extra'])
  assert.equal(rejected, 3)
  assert.equal((tasks[1] as unknown as Record<string, unknown>).body, undefined)
})

test('returns all 11 agents, idle when there is no task', () => {
  const states = buildAgentStates([task({ assignee: 'technical-supervisor', status: 'review' })])
  assert.equal(states.length, 11)
  assert.equal(AGENTS.length, 11)
  assert.equal(states.find((s) => s.id === 'goku')?.status, 'reviewing')
  assert.equal(states.find((s) => s.id === 'john')?.status, 'idle')
})

const blockedShow = (reason: string, kind: string | null = 'needs_input', extra: unknown[] = []) => ({
  task: {},
  events: [
    { kind: 'created', payload: {} },
    { kind: 'blocked', payload: { reason, kind, source_status: 'running' } },
    ...extra,
  ],
})

test('detects HUMAN_APPROVAL blocks and their category', () => {
  assert.equal(approvalFromShow(blockedShow('HUMAN_APPROVAL [budget]: pick a SKU. Options: A) B)')), 'budget')
  assert.equal(approvalFromShow(blockedShow('human_approval [Security]: open 443?')), 'security')
  assert.equal(approvalFromShow(blockedShow('HUMAN_APPROVAL [incident]: rollback?')), 'incident')
  assert.equal(approvalFromShow(blockedShow('HUMAN_APPROVAL: something')), 'other')
  // payload stored as a JSON string
  assert.equal(
    approvalFromShow({ events: [{ kind: 'blocked', payload: JSON.stringify({ reason: 'HUMAN_APPROVAL [budget]: x', kind: 'needs_input' }) }] }),
    'budget'
  )
})

test('ignores ordinary blocks, other kinds, unblocked tasks and junk', () => {
  assert.equal(approvalFromShow(blockedShow('waiting for parent task')), null)
  assert.equal(approvalFromShow(blockedShow('HUMAN_APPROVAL [budget]: x', 'transient')), null)
  assert.equal(approvalFromShow(blockedShow('HUMAN_APPROVAL [budget]: x', 'needs_input', [{ kind: 'unblocked', payload: {} }])), null)
  assert.equal(approvalFromShow(null), null)
  assert.equal(approvalFromShow({ events: 'x' }), null)
})

test('agent with a pending approval is HUMAN_APPROVAL and John joins the Approval Room', () => {
  const tasks = [task({ id: 'b1', assignee: 'finops-lead', status: 'blocked' })]
  const states = buildAgentStates(tasks, new Map([['b1', 'budget' as const]]))
  const piccolo = states.find((s) => s.id === 'piccolo')!
  assert.equal(piccolo.status, 'human-approval')
  assert.equal(piccolo.task?.approval, 'budget')
  assert.equal(states.find((s) => s.id === 'john')?.status, 'human-approval')
  // A plain block stays BLOCKED and John stays idle.
  const plain = buildAgentStates(tasks)
  assert.equal(plain.find((s) => s.id === 'piccolo')?.status, 'blocked')
  assert.equal(plain.find((s) => s.id === 'john')?.status, 'idle')
})

test('John keeps working when busy, even with approvals pending', () => {
  const tasks = [
    task({ id: 'b1', assignee: 'finops-lead', status: 'blocked' }),
    task({ id: 'j1', assignee: 'john-tdm', status: 'running' }),
  ]
  const states = buildAgentStates(tasks, new Map([['b1', 'security' as const]]))
  assert.equal(states.find((s) => s.id === 'john')?.status, 'working')
})

test('recent tasks: newest first, archived excluded, limited', () => {
  const tasks = [
    task({ id: 'old', created_at: 1 }),
    task({ id: 'done', status: 'done', created_at: 2, completed_at: 50 }),
    task({ id: 'arch', status: 'archived', created_at: 99 }),
    task({ id: 'run', status: 'running', created_at: 3, started_at: 40 }),
    task({ id: 'other', assignee: 'qa-validator', created_at: 100 }),
  ]
  assert.deepEqual(recentTasksForProfile(tasks, 'cloud-engineer').map((t) => t.id), ['done', 'run', 'old'])
  assert.equal(recentTasksForProfile(tasks, 'cloud-engineer', 1).length, 1)
})

test('overview groups work for John and summarises projects', () => {
  const tasks = [
    task({ id: 'a1', assignee: 'finops-lead', status: 'blocked', project_id: 'DC-0001', created_at: 5 }),
    task({ id: 'b1', assignee: 'network-engineer', status: 'blocked', project_id: 'DC-0001', created_at: 3 }),
    task({ id: 'r1', assignee: 'cloud-engineer', status: 'review', project_id: 'DC-0002', created_at: 4 }),
    task({ id: 'w1', assignee: 'iac-engineer', status: 'running', project_id: 'DC-0002', started_at: 9 }),
    task({ id: 'q1', assignee: 'qa-validator', status: 'ready', project_id: null }),
    task({ id: 'd1', assignee: 'qa-validator', status: 'done', project_id: 'DC-0002', completed_at: 20 }),
    task({ id: 'x1', status: 'archived', project_id: 'DC-0003' }),
  ]
  const o = buildOverview(tasks, new Map([['a1', 'budget' as const]]))
  assert.deepEqual(o.approvals.map((i) => [i.taskId, i.approval, i.agentName]), [['a1', 'budget', 'Piccolo']])
  assert.deepEqual(o.blocked.map((i) => i.taskId), ['b1'])
  assert.deepEqual(o.review.map((i) => i.taskId), ['r1'])
  assert.deepEqual(o.inProgress.map((i) => i.taskId), ['w1'])
  assert.deepEqual(o.waiting.map((i) => i.taskId), ['q1'])
  // DC-0001 first (pending approval), archived project excluded, Unassigned bucket present
  assert.deepEqual(o.projects.map((p) => p.projectId), ['DC-0001', 'DC-0002', 'Unassigned'])
  const p2 = o.projects.find((p) => p.projectId === 'DC-0002')!
  assert.equal(p2.total, 3)
  assert.equal(p2.open, 2)
  assert.equal(p2.byStatus.done, 1)
  assert.equal(p2.friendly, true)
  assert.equal(o.projects.find((p) => p.projectId === 'Unassigned')!.friendly, false)
})
