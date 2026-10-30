import { execFile } from 'child_process'
import { Router } from 'express'

const router = Router()

const hermesExe =
  process.env.HERMES_EXE ||
  `${process.env.LOCALAPPDATA}\\hermes\\bin\\hermes.exe`

interface HermesTask {
  id: string
  title: string
  assignee: string | null
  status: string
  project_id: string | null
  last_failure_error: string | null
  created_at: number
  started_at: number | null
}

const agents = [
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

const statusPriority: Record<string, number> = {
  running: 60,
  review: 50,
  blocked: 40,
  ready: 30,
  todo: 20,
  scheduled: 10,
}

function mapStatus(status?: string): string {
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

function activeTaskForProfile(
  tasks: HermesTask[],
  profile: string
): HermesTask | null {
  const candidates = tasks
    .filter(
      (task) =>
        task.assignee === profile &&
        !['done', 'archived', 'triage'].includes(task.status)
    )
    .sort(
      (a, b) =>
        (statusPriority[b.status] || 0) -
          (statusPriority[a.status] || 0) ||
        (b.started_at || b.created_at || 0) -
          (a.started_at || a.created_at || 0)
    )

  return candidates[0] || null
}

function loadKanbanTasks(): Promise<HermesTask[]> {
  return new Promise((resolve, reject) => {
    execFile(
      hermesExe,
      ['kanban', 'list', '--json'],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }

        try {
          const parsed = JSON.parse(stdout)

          if (!Array.isArray(parsed)) {
            throw new Error('Hermes returned an unexpected Kanban payload')
          }

          resolve(parsed as HermesTask[])
        } catch (parseError) {
          reject(parseError)
        }
      }
    )
  })
}

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    component: 'digital-company-office',
  })
})

router.get('/agents', async (_req, res) => {
  try {
    const tasks = await loadKanbanTasks()

    const response = agents.map((agent) => {
      const task = activeTaskForProfile(tasks, agent.profile)

      return {
        id: agent.id,
        name: agent.name,
        profile: agent.profile,
        status: mapStatus(task?.status),
        task: task
          ? {
              id: task.id,
              title: task.title,
              status: task.status,
              projectId: task.project_id,
              lastFailure: task.last_failure_error,
            }
          : null,
      }
    })

    res.json({
      source: 'hermes-kanban',
      generatedAt: new Date().toISOString(),
      agents: response,
    })
  } catch (error) {
    console.error('Digital Company Hermes adapter failed:', error)

    res.status(503).json({
      source: 'hermes-kanban',
      error: 'Hermes Kanban is unavailable',
      agents: [],
    })
  }
})

export default router
