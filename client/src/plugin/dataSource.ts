/**
 * Office data inside the Hermes Dashboard plugin.
 *
 * Fetches raw data from the plugin backend (/api/plugins/digital-company/*,
 * authenticated by the Dashboard through SDK.fetchJSON) and computes the same
 * responses as the standalone Express adapter, using the shared, tested logic
 * in shared/digital-company. No LLM calls.
 */
import { EventBuffer, KanbanEvent, describeEvent } from '../../../shared/digital-company/activity'
import {
  buildCompliance,
  buildItsmRooms,
  parseComplianceProfile,
  parseItsm,
  ProjectCompliance,
} from '../../../shared/digital-company/compliance'
import { aggregateFinOps, DashboardUsage, parseDashboardUsage } from '../../../shared/digital-company/finops'
import {
  AGENTS,
  ApprovalCategory,
  approvalFromShow,
  buildAgentStates,
  buildOverview,
  HermesTask,
  parseKanbanTasks,
  recentTasksForProfile,
} from '../../../shared/digital-company/status'
import { ApiBackend, ApiError } from '../digital-company/api'

type FetchJSON = (url: string, init?: RequestInit) => Promise<unknown>

const BASE = '/api/plugins/digital-company'
const SNAPSHOT_MS = 3000
const PROJECTS_MS = 15000
const FINOPS_MS = 60000

interface Snapshot {
  at: number
  tasks: HermesTask[] | null
  approvals: Map<string, ApprovalCategory>
  error: string | null
}

export function createPluginBackend(fetchJSON: FetchJSON): ApiBackend {
  let snapshot: Snapshot = { at: 0, tasks: null, approvals: new Map(), error: null }
  let inFlight: Promise<Snapshot> | null = null
  let projectsCache: { at: number; value: { projects: ProjectCompliance[]; error: string | null } } | null = null
  const finopsCache = new Map<number, { at: number; value: unknown }>()
  const events = new EventBuffer()
  let cursor = 0
  let eventsError: string | null = null

  const get = (path: string) => fetchJSON(`${BASE}${path}`)

  async function loadSnapshot(): Promise<Snapshot> {
    if (Date.now() - snapshot.at < SNAPSHOT_MS) return snapshot
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const raw = (await get('/tasks')) as { tasks?: unknown }
        const { tasks } = parseKanbanTasks(raw?.tasks)
        const approvals = new Map<string, ApprovalCategory>()
        if (tasks.some((t) => t.status === 'blocked')) {
          try {
            const blocked = (await get('/blocked-events')) as { byTask?: Record<string, unknown> }
            Object.entries(blocked?.byTask || {}).forEach(([id, evts]) => {
              const cat = Array.isArray(evts) ? approvalFromShow({ events: evts }) : null
              if (cat) approvals.set(id, cat)
            })
          } catch {
            // degrade to plain BLOCKED
          }
        }
        return { at: Date.now(), tasks, approvals, error: null }
      } catch (e) {
        return { at: Date.now(), tasks: null, approvals: new Map(), error: (e as Error).message || 'Hermes Kanban is unavailable' }
      }
    })().then((s) => {
      snapshot = s
      inFlight = null
      return s
    })
    return inFlight
  }

  async function requireTasks(): Promise<Snapshot & { tasks: HermesTask[] }> {
    const s = await loadSnapshot()
    if (!s.tasks) throw new ApiError('Hermes Kanban is unavailable', 503)
    return s as Snapshot & { tasks: HermesTask[] }
  }

  async function loadProjects() {
    if (projectsCache && Date.now() - projectsCache.at < PROJECTS_MS) return projectsCache.value
    let value: { projects: ProjectCompliance[]; error: string | null }
    try {
      const raw = (await get('/projects')) as { projects?: Array<{ dir: string; file: string; text: string }>; error?: string | null }
      const projects = (raw.projects || []).map((p) => {
        const parsed = parseComplianceProfile(p.text)
        return { ...parsed, itsm: parseItsm(p.text), projectId: parsed.projectId || p.dir, file: p.file }
      })
      value = { projects, error: raw.error || null }
    } catch (e) {
      value = { projects: [], error: (e as Error).message }
    }
    projectsCache = { at: Date.now(), value }
    return value
  }

  async function pullEvents(): Promise<void> {
    try {
      for (let page = 0; page < 5; page++) {
        const raw = (await get(`/events?since=${cursor}&limit=500`)) as { events?: KanbanEvent[]; cursor?: number }
        const batch = Array.isArray(raw.events) ? raw.events : []
        events.add(batch)
        if (typeof raw.cursor === 'number') cursor = Math.max(cursor, raw.cursor)
        if (batch.length < 500) break
      }
      eventsError = null
    } catch (e) {
      eventsError = (e as Error).message
    }
  }

  const now = () => new Date().toISOString()

  return async (path: string) => {
    const [route, query = ''] = path.split('?')
    const params = new URLSearchParams(query)

    if (route === '/agents') {
      const s = await requireTasks()
      return { source: 'hermes-kanban', generatedAt: new Date(s.at).toISOString(), agents: buildAgentStates(s.tasks, s.approvals) }
    }

    const detail = /^\/agents\/([^/]+)$/.exec(route)
    if (detail) {
      const id = decodeURIComponent(detail[1])
      const def = AGENTS.find((a) => a.id === id)
      if (!def) throw new ApiError('Unknown agent', 404)
      const s = await requireTasks()
      return {
        source: 'hermes-kanban',
        generatedAt: new Date(s.at).toISOString(),
        agent: buildAgentStates(s.tasks, s.approvals).find((a) => a.id === id),
        recentTasks: recentTasksForProfile(s.tasks, def.profile),
      }
    }

    if (route === '/overview') {
      const s = await requireTasks()
      return { source: 'hermes-kanban', generatedAt: new Date(s.at).toISOString(), ...buildOverview(s.tasks, s.approvals) }
    }

    if (route === '/finops') {
      const days = Math.min(365, Math.max(1, Number(params.get('days')) || 7))
      const hit = finopsCache.get(days)
      if (hit && Date.now() - hit.at < FINOPS_MS) return hit.value
      let value: unknown
      try {
        const raw = (await get(`/usage?days=${days}&profiles=${AGENTS.map((a) => a.profile).join(',')}`)) as {
          byProfile?: Record<string, unknown>
        }
        const per = new Map<string, DashboardUsage | Error>()
        Object.entries(raw.byProfile || {}).forEach(([profile, u]) => {
          try {
            if (u && typeof u === 'object' && 'error' in (u as object)) throw new Error(String((u as { error: unknown }).error))
            per.set(profile, parseDashboardUsage(u))
          } catch (e) {
            per.set(profile, e as Error)
          }
        })
        const ok = Array.from(per.values()).some((u) => !(u instanceof Error))
        value = ok
          ? { available: true, generatedAt: now(), ...aggregateFinOps(days, per) }
          : { available: false, reason: 'Hermes analytics returned no data for any profile', generatedAt: now() }
      } catch (e) {
        value = { available: false, reason: (e as Error).message, generatedAt: now() }
      }
      finopsCache.set(days, { at: Date.now(), value })
      return value
    }

    if (route === '/compliance') {
      const [s, p] = await Promise.all([loadSnapshot(), loadProjects()])
      return {
        source: 'project-memory+hermes-kanban',
        generatedAt: now(),
        kanbanAvailable: !!s.tasks,
        projectMemoryError: p.error,
        ...buildCompliance(s.tasks || [], s.approvals, p.projects),
      }
    }

    if (route === '/itsm') {
      const [s, p] = await Promise.all([loadSnapshot(), loadProjects()])
      return { generatedAt: now(), kanbanAvailable: !!s.tasks, projectMemoryError: p.error, rooms: buildItsmRooms(p.projects, s.tasks || [], s.approvals) }
    }

    if (route === '/activity') {
      const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100))
      const [s] = await Promise.all([loadSnapshot(), pullEvents()])
      const tasks = new Map((s.tasks || []).map((t) => [t.id, t]))
      const agents = new Map(AGENTS.map((a) => [a.profile, a]))
      return {
        source: 'hermes-kanban-events',
        generatedAt: now(),
        connected: eventsError === null,
        reason: eventsError,
        events: events.newest(limit).map((e) => {
          const t = tasks.get(e.task_id)
          const agent = t?.assignee ? agents.get(t.assignee) : undefined
          return {
            id: e.id,
            taskId: e.task_id,
            title: t?.title ?? null,
            agentId: agent?.id ?? null,
            agentName: agent?.name ?? t?.assignee ?? null,
            projectId: t?.project_id ?? null,
            kind: e.kind,
            summary: describeEvent(e.kind, e.payload),
            createdAt: e.created_at,
          }
        }),
      }
    }

    throw new ApiError(`Unknown Office route ${route}`, 404)
  }
}
