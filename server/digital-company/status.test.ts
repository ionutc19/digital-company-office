import { test } from 'node:test'
import { strict as assert } from 'assert'

import { activeTaskForProfile, buildAgentStates, mapStatus, parseKanbanTasks, AGENTS, HermesTask } from './status'

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
