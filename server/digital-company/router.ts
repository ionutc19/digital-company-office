import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Router } from 'express'

import { buildAgentStates, HermesTask, parseKanbanTasks } from './status'

/**
 * Read-only adapter: Hermes Kanban -> `hermes kanban list --json` -> JSON API.
 * - Never uses a shell (no injection surface; arguments are constant).
 * - One CLI call per CACHE_TTL_MS at most; concurrent requests share it.
 * - Validates the CLI payload before use.
 */

const CACHE_TTL_MS = Number(process.env.DC_KANBAN_CACHE_MS || 3000)
const CLI_TIMEOUT_MS = Number(process.env.DC_KANBAN_TIMEOUT_MS || 15000)

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
  error: string | null
}

let cache: CacheEntry = { at: 0, tasks: null, error: null }
let inFlight: Promise<CacheEntry> | null = null
let lastLoggedError: string | null = null

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
    .then((tasks) => {
      if (lastLoggedError) console.log('[digital-company] Hermes Kanban reachable again')
      lastLoggedError = null
      return { at: Date.now(), tasks, error: null }
    })
    .catch((err: Error) => {
      const message = err?.message || String(err)
      if (message !== lastLoggedError) {
        console.error('[digital-company] Hermes Kanban unavailable:', message)
        lastLoggedError = message
      }
      return { at: Date.now(), tasks: null, error: 'Hermes Kanban is unavailable' }
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
    agents: buildAgentStates(entry.tasks),
  })
})

export default router
