import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Router } from 'express'

import { ActivityFeed, describeEvent } from './activity'
import { buildCompliance, buildItsmRooms, loadProjects } from './compliance'
import { loadFinOps } from './finops'

import {
  AGENTS,
  ApprovalCategory,
  approvalFromShow,
  buildAgentStates,
  buildOverview,
  HermesTask,
  parseKanbanTasks,
  recentTasksForProfile,
} from './status'

/**
 * Read-only adapter: Hermes Kanban -> `hermes kanban list --json` -> JSON API.
 * - Never uses a shell (no injection surface; arguments are constant).
 * - One CLI call per CACHE_TTL_MS at most; concurrent requests share it.
 * - Validates the CLI payload before use.
 */

const CACHE_TTL_MS = Number(process.env.DC_KANBAN_CACHE_MS || 3000)
const CLI_TIMEOUT_MS = Number(process.env.DC_KANBAN_TIMEOUT_MS || 15000)
/** Blocked-task details change rarely; re-read each task at most this often. */
const APPROVAL_TTL_MS = Number(process.env.DC_APPROVAL_CACHE_MS || 15000)
const MAX_APPROVAL_LOOKUPS = 20

function resolveHermesExe(): string {
  const fromEnv = process.env.HERMES_EXE
  if (fromEnv) return fromEnv
  if (process.platform === 'win32') {
    const root = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || '', 'hermes')
    const candidates = [
      path.join(root, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      path.join(root, 'bin', 'hermes.exe'),
    ]
    const found = candidates.find((c) => fs.existsSync(c))
    if (found) return found
  }
  return 'hermes' // resolved from PATH (POSIX, or Windows when hermes.exe is on PATH)
}

const hermesExe = resolveHermesExe()

if (/\.(cmd|bat)$/i.test(hermesExe)) {
  // Node refuses to spawn .cmd/.bat without a shell (CVE-2024-27980) and we do
  // not want a shell. Point HERMES_EXE at hermes.exe instead.
  console.error(`[digital-company] HERMES_EXE points to a batch file (${hermesExe}); set it to hermes.exe.`)
}

interface CacheEntry {
  at: number
  tasks: HermesTask[] | null
  approvals: Map<string, ApprovalCategory>
  error: string | null
}

let cache: CacheEntry = { at: 0, tasks: null, approvals: new Map(), error: null }
const approvalCache = new Map<string, { at: number; category: ApprovalCategory | null }>()
let inFlight: Promise<CacheEntry> | null = null
let lastLoggedError: string | null = null

function runHermesJson(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      hermesExe,
      args,
      { windowsHide: true, timeout: CLI_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        try {
          resolve(JSON.parse(stdout))
        } catch (parseError) {
          reject(parseError)
        }
      }
    )
  })
}

/**
 * HUMAN_APPROVAL lives in the block event of a task, which `kanban list`
 * does not expose. Read `kanban show` only for blocked tasks, with a cache.
 * A failed lookup degrades to "plain blocked", never to an error.
 */
async function loadApprovals(tasks: HermesTask[]): Promise<Map<string, ApprovalCategory>> {
  const result = new Map<string, ApprovalCategory>()
  const blocked = tasks.filter((t) => t.status === 'blocked').slice(0, MAX_APPROVAL_LOOKUPS)
  const blockedIds = new Set(blocked.map((t) => t.id))
  approvalCache.forEach((_v, id) => {
    if (!blockedIds.has(id)) approvalCache.delete(id)
  })
  for (const t of blocked) {
    let entry = approvalCache.get(t.id)
    if (!entry || Date.now() - entry.at > APPROVAL_TTL_MS) {
      try {
        entry = { at: Date.now(), category: approvalFromShow(await runHermesJson(['kanban', 'show', t.id, '--json'])) }
      } catch (err) {
        console.warn(`[digital-company] could not read details of blocked task ${t.id}:`, (err as Error).message)
        entry = { at: Date.now(), category: null }
      }
      approvalCache.set(t.id, entry)
    }
    if (entry.category) result.set(t.id, entry.category)
  }
  return result
}

function runKanbanList(): Promise<HermesTask[]> {
  return new Promise((resolve, reject) => {
    execFile(
      hermesExe,
      ['kanban', 'list', '--json'],
      { windowsHide: true, timeout: CLI_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        try {
          const { tasks, rejected } = parseKanbanTasks(JSON.parse(stdout))
          if (rejected > 0) console.warn(`[digital-company] ignored ${rejected} malformed Kanban task(s)`)
          resolve(tasks)
        } catch (parseError) {
          reject(parseError)
        }
      }
    )
  })
}

async function loadKanban(): Promise<CacheEntry> {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache
  if (inFlight) return inFlight
  inFlight = runKanbanList()
    .then(async (tasks) => {
      if (lastLoggedError) console.log('[digital-company] Hermes Kanban reachable again')
      lastLoggedError = null
      const approvals = await loadApprovals(tasks)
      return { at: Date.now(), tasks, approvals, error: null }
    })
    .catch((err: Error) => {
      const message = err?.message || String(err)
      if (message !== lastLoggedError) {
        console.error('[digital-company] Hermes Kanban unavailable:', message)
        lastLoggedError = message
      }
      return { at: Date.now(), tasks: null, approvals: new Map<string, ApprovalCategory>(), error: 'Hermes Kanban is unavailable' }
    })
    .then((entry) => {
      cache = entry
      inFlight = null
      return entry
    })
  return inFlight
}

const router = Router()

router.get('/health', async (_req, res) => {
  const entry = await loadKanban()
  res.json({
    status: entry.tasks ? 'ok' : 'degraded',
    component: 'digital-company-office',
    hermes: entry.tasks ? 'ok' : 'unavailable',
    checkedAt: new Date(entry.at).toISOString(),
  })
})

router.get('/agents', async (_req, res) => {
  const entry = await loadKanban()
  res.set('Cache-Control', 'no-store')
  if (!entry.tasks) {
    res.status(503).json({ source: 'hermes-kanban', error: entry.error, agents: [] })
    return
  }
  res.json({
    source: 'hermes-kanban',
    generatedAt: new Date(entry.at).toISOString(),
    agents: buildAgentStates(entry.tasks, entry.approvals),
  })
})

router.get('/overview', async (_req, res) => {
  const entry = await loadKanban()
  res.set('Cache-Control', 'no-store')
  if (!entry.tasks) {
    res.status(503).json({ source: 'hermes-kanban', error: entry.error })
    return
  }
  res.json({
    source: 'hermes-kanban',
    generatedAt: new Date(entry.at).toISOString(),
    ...buildOverview(entry.tasks, entry.approvals),
  })
})

router.get('/compliance', async (_req, res) => {
  const entry = await loadKanban()
  res.set('Cache-Control', 'no-store')
  const { projects, error } = loadProjects()
  res.json({
    source: 'project-memory+hermes-kanban',
    generatedAt: new Date().toISOString(),
    kanbanAvailable: !!entry.tasks,
    projectMemoryError: error,
    ...buildCompliance(entry.tasks || [], entry.approvals, projects),
  })
})

const activityFeed = new ActivityFeed()

/** Newest Kanban events, enriched with task title, agent and project. */
router.get('/activity', async (req, res) => {
  activityFeed.ensureStarted()
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
  const entry = await loadKanban()
  const tasks = new Map((entry.tasks || []).map((t) => [t.id, t]))
  const agents = new Map(AGENTS.map((a) => [a.profile, a]))
  res.set('Cache-Control', 'no-store')
  res.json({
    source: 'hermes-kanban-events',
    generatedAt: new Date().toISOString(),
    connected: activityFeed.state.connected,
    reason: activityFeed.state.connected ? null : activityFeed.state.lastError,
    events: activityFeed.buffer.newest(limit).map((e) => {
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
  })
})

/** Projects grouped by ITSM type (Project Memory) with their open Kanban work. */
router.get('/itsm', async (_req, res) => {
  const entry = await loadKanban()
  const { projects, error } = loadProjects()
  const rooms = buildItsmRooms(projects, entry.tasks || [], entry.approvals)
  res.set('Cache-Control', 'no-store')
  res.json({ generatedAt: new Date().toISOString(), kanbanAvailable: !!entry.tasks, projectMemoryError: error, rooms })
})

router.get('/finops', async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 7))
  res.set('Cache-Control', 'no-store')
  res.json(await loadFinOps(days))
})

router.get('/agents/:id', async (req, res) => {
  const def = AGENTS.find((a) => a.id === req.params.id)
  if (!def) {
    res.status(404).json({ error: 'Unknown agent' })
    return
  }
  const entry = await loadKanban()
  res.set('Cache-Control', 'no-store')
  if (!entry.tasks) {
    res.status(503).json({ source: 'hermes-kanban', error: entry.error })
    return
  }
  const state = buildAgentStates(entry.tasks, entry.approvals).find((a) => a.id === def.id)
  res.json({
    source: 'hermes-kanban',
    generatedAt: new Date(entry.at).toISOString(),
    agent: state,
    recentTasks: recentTasksForProfile(entry.tasks, def.profile),
  })
})

export default router
