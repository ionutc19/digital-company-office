/**
 * Bulma's compliance view. Read-only sources:
 *  - Project Memory files in the digital-company repo
 *    (projects/<id>/PROJECT.md, "## Compliance Profile" section);
 *  - Hermes Kanban tasks owned by Bulma or using compliance skills;
 *  - pending HUMAN_APPROVAL [security] decisions.
 * Applicability and evidence mapping only: never declares compliance.
 */
import { AGENTS, ApprovalCategory, HermesTask } from './status'

export const FRAMEWORKS = ['GDPR', 'ISO27001', 'ISO22301', 'NIST_CSF', 'NIS2', 'DORA', 'EU_CRA'] as const
export type Framework = (typeof FRAMEWORKS)[number]

/** Vocabulary from agents/compliance-officer/SOUL.md and the project template. */
export const VALID_STATUSES = new Set([
  'APPLICABLE',
  'TARGET_STANDARD',
  'POTENTIALLY_APPLICABLE',
  'NOT_APPLICABLE',
  'UNKNOWN',
  'SECURITY_GUIDANCE',
  'NOT_REQUIRED',
])

export const DISCLAIMER =
  'Applicability and evidence mapping only. This is not legal advice and does not declare any organisation, ' +
  'architecture or implementation compliant or certified.'

/** Compliance skills in digital-company/.hermes/skills/compliance -> framework. */
const SKILL_FRAMEWORK: Record<string, Framework | 'ROUTER'> = {
  'gdpr-security-review': 'GDPR',
  'iso27001-security-review': 'ISO27001',
  'iso22301-continuity-review': 'ISO22301',
  'nist-csf-review': 'NIST_CSF',
  'nis2-security-review': 'NIS2',
  'dora-security-review': 'DORA',
  'eu-cra-review': 'EU_CRA',
  'security-framework-router': 'ROUTER',
}

export interface FrameworkStatus {
  status: string
  recognized: boolean
}

export interface ProjectCompliance {
  projectId: string
  name: string | null
  file: string
  frameworks: Record<Framework, FrameworkStatus>
  otherFrameworks: string[]
  evidence: string[]
  openQuestions: string[]
  itsm: ItsmClassification
}

export const ITSM_TYPES = ['REQUEST', 'CHANGE', 'INCIDENT', 'PROBLEM', 'PROJECT'] as const
export interface ItsmClassification {
  type: string
  changeType: string
  riskLevel: string | null
}

/** Parses "## ITSM Classification" (Type / Change Type / Risk Level). */
export function parseItsm(markdown: string): ItsmClassification {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^##\s+ITSM Classification\s*$/i.test(l.trim()))
  const out: ItsmClassification = { type: 'UNCLASSIFIED', changeType: 'N/A', riskLevel: null }
  if (start < 0) return out
  const section: string[] = []
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) section.push(lines[i])
  const valueOf = (key: string): string | null => {
    const idx = section.findIndex((l) => l.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`))
    if (idx < 0) return null
    const same = section[idx].trim().slice(key.length + 1).trim()
    if (same) return same
    const next = section.slice(idx + 1).find((l) => l.trim())
    return next && !/^[A-Za-z ]+:\s*/.test(next.trim()) ? next.trim() : null
  }
  const pick = (raw: string | null, allowed: readonly string[], fallback: string) => {
    if (!raw || raw.includes('/')) return fallback // template still lists the options
    const v = raw.toUpperCase()
    return allowed.includes(v) ? v : fallback
  }
  out.type = pick(valueOf('Type'), ITSM_TYPES, 'UNCLASSIFIED')
  out.changeType = pick(valueOf('Change Type'), ['STANDARD', 'NORMAL', 'EMERGENCY', 'N/A'], 'N/A')
  const risk = valueOf('Risk Level')
  out.riskLevel = risk && !risk.includes('/') ? risk : null
  return out
}

const KEY_LINE = /^([A-Za-z0-9_ ]+):\s*(.*)$/

/** Parses the "## Compliance Profile" section of a Project Memory file. */
export function parseComplianceProfile(markdown: string): Omit<ProjectCompliance, 'file' | 'itsm'> & { projectId: string | null } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const header = (key: string) => {
    const l = lines.find((x) => x.toLowerCase().startsWith(`${key.toLowerCase()}:`))
    const v = l ? l.slice(key.length + 1).trim() : ''
    return v || null
  }

  const start = lines.findIndex((l) => /^##\s+Compliance Profile\s*$/i.test(l.trim()))
  const section: string[] = []
  if (start >= 0) {
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break
      section.push(lines[i])
    }
  }

  // Key: value either on the same line or on the following non-empty lines.
  const values = new Map<string, string[]>()
  let current: string | null = null
  for (const raw of section) {
    const line = raw.trim()
    if (!line) continue
    const m = KEY_LINE.exec(line)
    if (m && !line.startsWith('-') && !line.startsWith('*')) {
      current = m[1].trim().toUpperCase().replace(/\s+/g, '_')
      values.set(current, m[2].trim() ? [m[2].trim()] : [])
      continue
    }
    if (current) values.get(current)!.push(line.replace(/^[-*]\s*/, ''))
  }

  const frameworks = {} as Record<Framework, FrameworkStatus>
  for (const f of FRAMEWORKS) {
    const v = (values.get(f)?.[0] || 'UNKNOWN').trim()
    // The template lists the options for NIST_CSF ("A / B / C"): that means not decided yet.
    const status = v.includes('/') ? 'UNKNOWN' : v.toUpperCase()
    frameworks[f] = { status, recognized: VALID_STATUSES.has(status) }
  }
  const list = (key: string) => (values.get(key) || []).filter((x) => x && x.toUpperCase() !== 'NONE')

  return {
    projectId: header('Project ID'),
    name: header('Project Name'),
    frameworks,
    otherFrameworks: list('OTHER_FRAMEWORKS'),
    evidence: list('COMPLIANCE_EVIDENCE'),
    openQuestions: list('OPEN_COMPLIANCE_QUESTIONS'),
  }
}

/** Frameworks a task touches, from its explicit compliance skills. */
export function taskFrameworks(skills: string[] | undefined): { frameworks: Framework[]; router: boolean } {
  const frameworks = new Set<Framework>()
  let router = false
  for (const s of skills || []) {
    const f = SKILL_FRAMEWORK[s]
    if (f === 'ROUTER') router = true
    else if (f) frameworks.add(f)
  }
  return { frameworks: Array.from(frameworks), router }
}

const BULMA = 'compliance-officer'
const agentByProfile = new Map(AGENTS.map((a) => [a.profile, a]))

export function buildCompliance(
  tasks: HermesTask[],
  approvals: Map<string, ApprovalCategory>,
  projects: ProjectCompliance[]
) {
  const complianceTasks = tasks
    .filter((t) => t.status !== 'archived')
    .map((t) => ({ t, ...taskFrameworks(t.skills) }))
    .filter(({ t, frameworks, router }) => t.assignee === BULMA || frameworks.length > 0 || router)
    .map(({ t, frameworks, router }) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      agentId: (t.assignee && agentByProfile.get(t.assignee)?.id) || null,
      agentName: (t.assignee && agentByProfile.get(t.assignee)?.name) || t.assignee,
      projectId: t.project_id,
      frameworks,
      applicabilityCheck: router,
      approval: approvals.get(t.id) ?? null,
    }))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))

  const securityApprovals = tasks
    .filter((t) => t.status === 'blocked' && approvals.get(t.id) === 'security')
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      agentId: (t.assignee && agentByProfile.get(t.assignee)?.id) || null,
      agentName: (t.assignee && agentByProfile.get(t.assignee)?.name) || t.assignee,
      projectId: t.project_id,
    }))

  return { disclaimer: DISCLAIMER, frameworks: FRAMEWORKS, projects, tasks: complianceTasks, securityApprovals }
}
