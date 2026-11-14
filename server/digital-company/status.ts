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
  completed_at?: number | null
  skills?: string[]
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
      isNumOrNull(t.started_at) &&
      isNumOrNull(t.completed_at)
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
        completed_at: (t.completed_at as number | null) ?? null,
        skills: Array.isArray(t.skills) ? (t.skills as unknown[]).filter((x): x is string => typeof x === 'string') : [],
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

const lastActivity = (t: HermesTask) => t.completed_at || t.started_at || t.created_at || 0

/** Most recent tasks of one profile (any status except archived), newest first. */
export function recentTasksForProfile(tasks: HermesTask[], profile: string, limit = 8) {
  return tasks
    .filter((t) => t.assignee === profile && t.status !== 'archived')
    .sort((a, b) => lastActivity(b) - lastActivity(a))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectId: t.project_id,
      lastActivityAt: lastActivity(t) || null,
    }))
}

const agentByProfile = new Map(AGENTS.map((a) => [a.profile, a]))
const FRIENDLY_PROJECT = /^DC-\d{4}$/

export interface OverviewItem {
  taskId: string
  title: string
  status: string
  agentId: string | null
  agentName: string | null
  projectId: string | null
  since: number | null
  approval?: ApprovalCategory
  lastFailure?: string | null
}

export interface ProjectSummary {
  projectId: string
  friendly: boolean
  total: number
  open: number
  byStatus: Record<string, number>
  agents: string[]
  pendingApprovals: number
  lastActivityAt: number | null
}

const toItem = (t: HermesTask, approvals: Map<string, ApprovalCategory>): OverviewItem => {
  const agent = t.assignee ? agentByProfile.get(t.assignee) : undefined
  const approval = approvals.get(t.id)
  return {
    taskId: t.id,
    title: t.title,
    status: t.status,
    agentId: agent?.id ?? null,
    agentName: agent?.name ?? t.assignee ?? null,
    projectId: t.project_id,
    since: t.started_at || t.created_at || null,
    ...(approval ? { approval } : {}),
    ...(t.last_failure_error ? { lastFailure: t.last_failure_error } : {}),
  }
}

const bySinceAsc = (a: OverviewItem, b: OverviewItem) => (a.since || 0) - (b.since || 0)

/**
 * John's Control Center: what needs Ionut, what is stuck, what is moving,
 * Goku's review queue and a per-project summary. Pure and LLM-free.
 */
export function buildOverview(tasks: HermesTask[], approvals: Map<string, ApprovalCategory> = new Map()) {
  const live = tasks.filter((t) => t.status !== 'archived')
  const items = live.map((t) => toItem(t, approvals))
  const pick = (pred: (i: OverviewItem) => boolean) => items.filter(pred).sort(bySinceAsc)

  const projects = new Map<string, ProjectSummary>()
  for (const t of live) {
    const key = t.project_id || 'Unassigned'
    let p = projects.get(key)
    if (!p) {
      p = { projectId: key, friendly: FRIENDLY_PROJECT.test(key), total: 0, open: 0, byStatus: {}, agents: [], pendingApprovals: 0, lastActivityAt: null }
      projects.set(key, p)
    }
    p.total++
    if (!['done', 'archived'].includes(t.status)) p.open++
    p.byStatus[t.status] = (p.byStatus[t.status] || 0) + 1
    const name = (t.assignee && agentByProfile.get(t.assignee)?.name) || t.assignee
    if (name && !p.agents.includes(name)) p.agents.push(name)
    if (t.status === 'blocked' && approvals.has(t.id)) p.pendingApprovals++
    const act = t.completed_at || t.started_at || t.created_at || 0
    if (act && (!p.lastActivityAt || act > p.lastActivityAt)) p.lastActivityAt = act
  }

  return {
    approvals: pick((i) => i.status === 'blocked' && !!i.approval),
    blocked: pick((i) => i.status === 'blocked' && !i.approval),
    inProgress: pick((i) => i.status === 'running'),
    review: pick((i) => i.status === 'review'),
    waiting: pick((i) => ['ready', 'todo', 'scheduled'].includes(i.status)),
    triage: pick((i) => i.status === 'triage'),
    projects: Array.from(projects.values()).sort(
      (a, b) => b.pendingApprovals - a.pendingApprovals || b.open - a.open || (b.lastActivityAt || 0) - (a.lastActivityAt || 0)
    ),
  }
}
