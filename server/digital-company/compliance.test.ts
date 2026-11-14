import { test } from 'node:test'
import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { buildCompliance, loadProjects, parseComplianceProfile, taskFrameworks } from './compliance'
import { HermesTask } from './status'

const md = `# Project Memory

Project ID: DC-0001
Project Name: Hub network
Status: active

## Compliance Profile

GDPR:
APPLICABLE

ISO27001: TARGET_STANDARD

ISO22301:
UNKNOWN

NIST_CSF:
SECURITY_GUIDANCE / NOT_REQUIRED / UNKNOWN

NIS2:
potentially_applicable

DORA:
NOT_APPLICABLE

EU_CRA:
COMPLIANT

Other Frameworks:
- SOC 2 (customer request)

Compliance Evidence:
- ADR-0003 encryption at rest
- Key Vault RBAC review

Open Compliance Questions:
- Is the customer an essential entity under NIS2?

## Relevant ADRs
`

test('parses the Compliance Profile of a Project Memory file', () => {
  const p = parseComplianceProfile(md)
  assert.equal(p.projectId, 'DC-0001')
  assert.equal(p.name, 'Hub network')
  assert.deepEqual(p.frameworks.GDPR, { status: 'APPLICABLE', recognized: true })
  assert.equal(p.frameworks.ISO27001.status, 'TARGET_STANDARD')
  assert.equal(p.frameworks.NIST_CSF.status, 'UNKNOWN') // template options = undecided
  assert.equal(p.frameworks.NIS2.status, 'POTENTIALLY_APPLICABLE')
  // "COMPLIANT" is not an allowed status (Bulma never declares compliance)
  assert.deepEqual(p.frameworks.EU_CRA, { status: 'COMPLIANT', recognized: false })
  assert.deepEqual(p.otherFrameworks, ['SOC 2 (customer request)'])
  assert.deepEqual(p.evidence, ['ADR-0003 encryption at rest', 'Key Vault RBAC review'])
  assert.deepEqual(p.openQuestions, ['Is the customer an essential entity under NIS2?'])
})

test('a file without a Compliance Profile is all UNKNOWN', () => {
  const p = parseComplianceProfile('# Project Memory\n\nProject ID: DC-0009\n')
  assert.equal(p.frameworks.GDPR.status, 'UNKNOWN')
  assert.deepEqual(p.evidence, [])
})

test('maps compliance skills to frameworks', () => {
  assert.deepEqual(taskFrameworks(['gdpr-security-review', 'terraform-validation']), { frameworks: ['GDPR'], router: false })
  assert.deepEqual(taskFrameworks(['security-framework-router']), { frameworks: [], router: true })
  assert.deepEqual(taskFrameworks(undefined), { frameworks: [], router: false })
})

test('loads projects from disk, skipping _template', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'))
  fs.mkdirSync(path.join(root, 'projects', '_template'), { recursive: true })
  fs.writeFileSync(path.join(root, 'projects', '_template', 'PROJECT.md'), md)
  fs.mkdirSync(path.join(root, 'projects', 'DC-0001'))
  fs.writeFileSync(path.join(root, 'projects', 'DC-0001', 'PROJECT.md'), md)
  const r = loadProjects(root)
  assert.equal(r.error, null)
  assert.deepEqual(r.projects.map((p) => p.projectId), ['DC-0001'])
  assert.match(loadProjects(path.join(root, 'missing')).error || '', /not found/)
})

const t = (o: Partial<HermesTask>): HermesTask => ({
  id: 'x', title: 'T', assignee: null, status: 'todo', project_id: null, last_failure_error: null, created_at: 1, started_at: null, ...o,
})

test('collects compliance tasks and security approvals', () => {
  const tasks = [
    t({ id: 'b1', assignee: 'compliance-officer', status: 'running' }),
    t({ id: 's1', assignee: 'security-engineer', skills: ['nis2-security-review'] }),
    t({ id: 'n1', assignee: 'iac-engineer', skills: ['terraform-validation'] }),
    t({ id: 'a1', assignee: 'network-engineer', status: 'blocked' }),
  ]
  const c = buildCompliance(tasks, new Map([['a1', 'security' as const]]), [])
  assert.deepEqual(c.tasks.map((x) => x.taskId), ['b1', 's1'])
  assert.deepEqual(c.tasks.find((x) => x.taskId === 's1')!.frameworks, ['NIS2'])
  assert.deepEqual(c.securityApprovals.map((x) => [x.taskId, x.agentName]), [['a1', 'Pikachu']])
  assert.match(c.disclaimer, /not legal advice/)
})
