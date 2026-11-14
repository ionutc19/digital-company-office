/**
 * Pure, side-effect-free status derivation for the Digital Company roster.
 * Operational state comes ONLY from Hermes Kanban data; no LLM calls.
 */

export type AgentStatus =
  | 'working'
  | 'reviewing'
  | 'blocked'
  | 'waiting'
  | 'idle'
  | 'human-approval'
  | 'offline'

/** Subset of `hermes kanban list --json` fields used by the Office. */
export interface HermesTask {
  id: string
  title: string
  assignee: string | null
  status: string
  project_id: string | null
  last_failure_error: string | null
  created_at: number | null
  started_at: number | null
}

export interface AgentDefinition {
  id: string
  name: string
  profile: string
}

/** Fleet membership. Mirrors digital-company/company/roster.yaml. */
export const AGENTS: AgentDefinition[] = [
  { id: 'john', name: 'John / TDM', profile: 'john-tdm' },
  { id: 'alakazam', name: 'Alakazam', profile: 'product-manager' },
  { id: 'piccolo', name: 'Piccolo', profile: 'finops-lead' },
  { id: 'bulma', name: 'Bulma', profile: 'compliance-officer' },
  { id: 'goku', name: 'Goku', profile: 'technical-supervisor' },
  { id: 'charizard', name: 'Charizard', profile: 'cloud-engineer' },
  { id: 'pikachu', name: 'Pikachu', profile: 'network-engineer' },
  { id: 'gengar', name: 'Gengar', profile: 'security-engineer' },
  { id: 'machamp', name: 'Machamp', profile: 'iac-engineer' },
  { id: 'porygon', name: 'Porygon', profile: 'platform-devops' },
  { id: 'psyduck', name: 'Psyduck', profile: 'qa-validator' },
]

/** Hermes Kanban statuses (hermes_cli/kanban_db.py VALID_STATUSES). */
export const KANBAN_STATUSES = [
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done',
  'archived',
] as const

const INACTIVE = new Set(['done', 'archived', 'triage'])

const STATUS_PRIORITY: Record<string, number> = {
  running: 60,
  review: 50,
  blocked: 40,
  ready: 30,
  todo: 20,
  scheduled: 10,
}

export function mapStatus(status?: string | null): AgentStatus {
  switch (status) {
    case 'running':
      return 'working'
    case 'review':
      return 'reviewing'
    case 'blocked':
      return 'blocked'
    case 'ready':
    case 'todo':
    case 'scheduled':
      return 'waiting'
    default:
      return 'idle'
  }
}

export function activeTaskForProfile(tasks: HermesTask[], profile: string): HermesTask | null {
  const candidates = tasks
    .filter((t) => t.assignee === profile && !INACTIVE.has(t.status))
    .sort(
      (a, b) =>
        (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0) ||
        (b.started_at || b.created_at || 0) - (a.started_at || a.created_at || 0)
    )
  return candidates[0] || null
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrOrNull = (v: unknown): v is string | null => v === null || v === undefined || typeof v === 'string'
const isNumOrNull = (v: unknown): v is number | null => v === null || v === undefined || typeof v === 'number'

export interface ParseResult {
  tasks: HermesTask[]
  rejected: number
}

/**
 * Validates untrusted CLI JSON. Invalid items are dropped and counted rather
 * than crashing the endpoint; a non-array payload is an error.
 */
export function parseKanbanTasks(payload: unknown): ParseResult {
  if (!Array.isArray(payload)) {
    throw new Error('Hermes returned an unexpected Kanban payload (expected a JSON array)')
  }
  const tasks: HermesTask[] = []
  let rejected = 0
  for (const item of payload) {
    const t = item as Record<string, unknown>
    if (
      t &&
      typeof t === 'object' &&
      isStr(t.id) &&
      isStr(t.title) &&
      isStr(t.status) &&
      isStrOrNull(t.assignee) &&
      isStrOrNull(t.project_id) &&
      isStrOrNull(t.last_failure_error) &&
      isNumOrNull(t.created_at) &&
      isNumOrNull(t.started_at)
    ) {
      tasks.push({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: (t.assignee as string | null) ?? null,
        project_id: (t.project_id as string | null) ?? null,
        last_failure_error: (t.last_failure_error as string | null) ?? null,
        created_at: (t.created_at as number | null) ?? null,
        started_at: (t.started_at as number | null) ?? null,
      })
    } else {
      rejected++
    }
  }
  return { tasks, rejected }
}

export type ApprovalCategory = 'budget' | 'security' | 'incident' | 'other'

/** Marker defined by the human-approval-gate skill in digital-company. */
const APPROVAL_MARKER = /^\s*HUMAN_APPROVAL\s*(?:\[\s*([a-z-]+)\s*\])?/i

/**
 * Reads `hermes kanban show <id> --json` and returns the approval category
 * when the task's latest block is a needs_input block whose reason starts
 * with the HUMAN_APPROVAL marker; otherwise null.
 */
export function approvalFromShow(show: unknown): ApprovalCategory | null {
  const events = (show as { events?: unknown })?.events
  if (!Array.isArray(events)) return null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { kind?: unknown; payload?: unknown }
    if (e?.kind === 'unblocked') return null
    if (e?.kind !== 'blocked') continue
    let payload = e.payload as Record<string, unknown> | string | null | undefined
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as Record<string, unknown>
      } catch {
        return null
      }
    }
    const reason = typeof payload?.reason === 'string' ? payload.reason : ''
    const kind = payload?.kind
    const m = APPROVAL_MARKER.exec(reason)
    if (!m || (kind !== undefined && kind !== null && kind !== 'needs_input')) return null
    const cat = (m[1] || '').toLowerCase()
    return cat === 'budget' || cat === 'security' || cat === 'incident' ? cat : 'other'
  }
  return null
}

const ORCHESTRATOR_PROFILE = 'john-tdm'

/**
 * @param approvals taskId -> category for blocked tasks awaiting Ionut.
 * An agent whose active task awaits approval is HUMAN_APPROVAL. John, who
 * relays every approval, joins the Approval Room when he is idle or waiting.
 */
export function buildAgentStates(tasks: HermesTask[], approvals: Map<string, ApprovalCategory> = new Map()) {
  const anyPending = tasks.some((t) => t.status === 'blocked' && approvals.has(t.id))
  return AGENTS.map((agent) => {
    const task = activeTaskForProfile(tasks, agent.profile)
    let status: AgentStatus = mapStatus(task?.status)
    if (task && task.status === 'blocked' && approvals.has(task.id)) status = 'human-approval'
    if (agent.profile === ORCHESTRATOR_PROFILE && anyPending && (status === 'idle' || status === 'waiting')) {
      status = 'human-approval'
    }
    return {
      id: agent.id,
      name: agent.name,
      profile: agent.profile,
      status,
      task: task
        ? {
            id: task.id,
            title: task.title,
            status: task.status,
            projectId: task.project_id,
            lastFailure: task.last_failure_error,
            approval: approvals.get(task.id) ?? null,
          }
        : null,
    }
  })
}
