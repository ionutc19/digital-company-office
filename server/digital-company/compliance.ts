/** I/O half of the compliance view; pure parsing lives in shared/. */
import * as fs from 'fs'
import * as path from 'path'

import { parseComplianceProfile, parseItsm, ProjectCompliance } from '../../shared/digital-company/compliance'

export * from '../../shared/digital-company/compliance'

// ---------------------------------------------------------------------------
// I/O: read Project Memory files (read-only, bounded).

const MAX_PROJECTS = 200
const MAX_FILE_BYTES = 256 * 1024

export function companyRoot(): string {
  return process.env.DC_COMPANY_ROOT || path.resolve(__dirname, '..', '..', '..', 'digital-company')
}

export function loadProjects(root = companyRoot()): { projects: ProjectCompliance[]; error: string | null } {
  const dir = path.join(root, 'projects')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return { projects: [], error: `Project Memory not found at ${dir} (set DC_COMPANY_ROOT)` }
  }
  const projects: ProjectCompliance[] = []
  for (const e of entries.filter((x) => x.isDirectory() && !x.name.startsWith('_') && !x.name.startsWith('.')).slice(0, MAX_PROJECTS)) {
    const file = path.join(dir, e.name, 'PROJECT.md')
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) continue
      const text = fs.readFileSync(file, 'utf8')
      const parsed = parseComplianceProfile(text)
      projects.push({ ...parsed, itsm: parseItsm(text), projectId: parsed.projectId || e.name, file: path.relative(root, file) })
    } catch {
      // Missing or unreadable PROJECT.md: skip the folder.
    }
  }
  projects.sort((a, b) => a.projectId.localeCompare(b.projectId))
  return { projects, error: null }
}
