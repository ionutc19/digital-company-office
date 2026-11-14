import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { selectAgent } from '../digital-company/agentSelection'
import { setComplianceOpen, subscribeCompliance } from '../digital-company/controlCenter'

type Framework = 'GDPR' | 'ISO27001' | 'ISO22301' | 'NIST_CSF' | 'NIS2' | 'DORA' | 'EU_CRA'

interface ComplianceData {
  generatedAt: string
  disclaimer: string
  kanbanAvailable: boolean
  projectMemoryError: string | null
  frameworks: Framework[]
  projects: Array<{
    projectId: string
    name: string | null
    file: string
    frameworks: Record<Framework, { status: string; recognized: boolean }>
    otherFrameworks: string[]
    evidence: string[]
    openQuestions: string[]
  }>
  tasks: Array<{
    taskId: string
    title: string
    status: string
    agentId: string | null
    agentName: string | null
    projectId: string | null
    frameworks: Framework[]
    applicabilityCheck: boolean
    approval: string | null
  }>
  securityApprovals: Array<{ taskId: string; title: string; agentId: string | null; agentName: string | null; projectId: string | null }>
}

const REFRESH_MS = 15000

const LABEL: Record<Framework, string> = {
  GDPR: 'GDPR',
  ISO27001: 'ISO 27001',
  ISO22301: 'ISO 22301',
  NIST_CSF: 'NIST CSF',
  NIS2: 'NIS2',
  DORA: 'DORA',
  EU_CRA: 'EU CRA',
}

const STATUS_STYLE: Record<string, { bg: string; fg?: string; short: string }> = {
  APPLICABLE: { bg: '#f87171', short: 'Applicable' },
  TARGET_STANDARD: { bg: '#60a5fa', short: 'Target' },
  POTENTIALLY_APPLICABLE: { bg: '#fbbf24', short: 'Potential' },
  NOT_APPLICABLE: { bg: '#475569', fg: '#e2e8f0', short: 'N/A' },
  NOT_REQUIRED: { bg: '#475569', fg: '#e2e8f0', short: 'Not req.' },
  SECURITY_GUIDANCE: { bg: '#a78bfa', short: 'Guidance' },
  UNKNOWN: { bg: '#334155', fg: '#cbd5e1', short: 'Unknown' },
}

const Panel = styled.section`
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1002;
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(96, 165, 250, 0.45);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  font-size: 12px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);

  h2 {
    margin: 0;
    font-size: 16px;
    color: #93c5fd;
  }
  p {
    margin: 2px 0 0;
    color: #94a3b8;
  }
  button {
    border: 1px solid rgba(147, 197, 253, 0.5);
    border-radius: 8px;
    padding: 4px 9px;
    color: #93c5fd;
    background: transparent;
    cursor: pointer;
  }
`

const Disclaimer = styled.div`
  margin: 10px 16px 0;
  border-left: 3px solid #60a5fa;
  padding: 6px 8px;
  color: #bfdbfe;
  background: rgba(96, 165, 250, 0.1);
`

const Warn = styled.div`
  margin: 8px 16px 0;
  border-left: 3px solid #eab308;
  padding: 6px 8px;
  color: #fef08a;
  background: rgba(234, 179, 8, 0.1);
`

const Section = styled.div`
  padding: 10px 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  margin-top: 8px;

  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 4px 2px;
    text-align: center;
    border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
  }
  th {
    color: #94a3b8;
    font-weight: 600;
    font-size: 10px;
  }
  td:first-child,
  th:first-child {
    text-align: left;
  }
`

const Cell = styled.span<{ $bg: string; $fg?: string }>`
  display: inline-block;
  min-width: 52px;
  border-radius: 6px;
  padding: 1px 4px;
  font-size: 10px;
  font-weight: 700;
  color: ${({ $fg }) => $fg || '#0f172a'};
  background: ${({ $bg }) => $bg};
`

const Row = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  border: 0;
  border-radius: 8px;
  margin-bottom: 4px;
  padding: 6px 8px;
  text-align: left;
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.7);
  cursor: pointer;

  &:hover {
    background: rgba(51, 65, 85, 0.95);
  }
  small {
    color: #94a3b8;
  }
`

const Muted = styled.div`
  color: #64748b;
`

function StatusCell({ value }: { value: { status: string; recognized: boolean } }) {
  if (!value.recognized) {
    return (
      <Cell $bg="#fca5a5" title={`"${value.status}" is not a valid applicability status (Bulma never declares compliance)`}>
        Invalid
      </Cell>
    )
  }
  const s = STATUS_STYLE[value.status] || STATUS_STYLE.UNKNOWN
  return (
    <Cell $bg={s.bg} $fg={s.fg} title={value.status}>
      {s.short}
    </Cell>
  )
}

/**
 * Bulma's compliance view: framework applicability per project (Project
 * Memory), compliance work on the Kanban board and security decisions that
 * wait for Ionut. Read-only, no LLM calls, never declares compliance.
 */
export default function CompliancePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ComplianceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeCompliance(setOpen), [])

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/digital-company/compliance', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as ComplianceData
        if (active) {
          setData(body)
          setError(null)
        }
      } catch (e) {
        if (active) setError((e as Error).message)
      }
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [open])

  if (!open) return null

  return (
    <Panel aria-label="Compliance">
      <Header>
        <div>
          <h2>Bulma · Compliance &amp; Governance</h2>
          <p>Sources: Project Memory (projects/*/PROJECT.md) and Hermes Kanban</p>
        </div>
        <button type="button" onClick={() => setComplianceOpen(false)} title="Close">
          ✕
        </button>
      </Header>

      <Disclaimer>{data?.disclaimer || 'Applicability and evidence mapping only. Not legal advice.'}</Disclaimer>
      {error && <Warn>Office API error: {error}</Warn>}
      {data?.projectMemoryError && <Warn>{data.projectMemoryError}</Warn>}
      {data && !data.kanbanAvailable && <Warn>Hermes Kanban is unavailable; task lists are not live.</Warn>}

      {data && (
        <>
          <Section>
            <h3>Security decisions waiting for Ionut ({data.securityApprovals.length})</h3>
            {data.securityApprovals.length ? (
              data.securityApprovals.map((a) => (
                <Row key={a.taskId} type="button" onClick={() => a.agentId && selectAgent(a.agentId)}>
                  <strong>{a.title}</strong>
                  <small>{a.projectId || 'no project'}</small>
                  <small>
                    {a.agentName} · Kanban {a.taskId}
                  </small>
                </Row>
              ))
            ) : (
              <Muted>None.</Muted>
            )}
          </Section>

          <Section>
            <h3>Framework applicability by project ({data.projects.length})</h3>
            {data.projects.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    {data.frameworks.map((f) => (
                      <th key={f}>{LABEL[f]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p.projectId}>
                      <td title={`${p.name || ''} — ${p.file}`}>
                        <b style={{ color: '#5eead4' }}>{p.projectId}</b>
                      </td>
                      {data.frameworks.map((f) => (
                        <td key={f}>
                          <StatusCell value={p.frameworks[f]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Muted>No projects in Project Memory yet (projects/DC-####/PROJECT.md).</Muted>
            )}
          </Section>

          {data.projects
            .filter((p) => p.evidence.length || p.openQuestions.length || p.otherFrameworks.length)
            .map((p) => (
              <Section key={`ev-${p.projectId}`}>
                <h3>
                  {p.projectId} · evidence ({p.evidence.length}) · open questions ({p.openQuestions.length})
                </h3>
                {p.otherFrameworks.length > 0 && <div>Other frameworks: {p.otherFrameworks.join('; ')}</div>}
                {p.evidence.map((e) => (
                  <div key={e}>✓ {e}</div>
                ))}
                {p.openQuestions.map((q) => (
                  <div key={q} style={{ color: '#fde68a' }}>
                    ? {q}
                  </div>
                ))}
              </Section>
            ))}

          <Section>
            <h3>Compliance work on the board ({data.tasks.length})</h3>
            {data.tasks.length ? (
              data.tasks.map((t) => (
                <Row key={t.taskId} type="button" onClick={() => t.agentId && selectAgent(t.agentId)}>
                  <strong>{t.title}</strong>
                  <small>{t.status}</small>
                  <small>
                    {t.agentName || 'unassigned'} · {t.projectId || 'no project'} ·{' '}
                    {t.frameworks.length ? t.frameworks.map((f) => LABEL[f]).join(', ') : t.applicabilityCheck ? 'applicability check' : 'general'}
                  </small>
                  {t.approval && <small style={{ color: '#d8b4fe' }}>awaiting Ionut ({t.approval})</small>}
                </Row>
              ))
            ) : (
              <Muted>No compliance tasks on the board.</Muted>
            )}
          </Section>
        </>
      )}
    </Panel>
  )
}
