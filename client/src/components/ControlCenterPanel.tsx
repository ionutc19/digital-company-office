import React, { useEffect, useState } from 'react'
import { apiGet } from '../digital-company/api'
import styled from 'styled-components'

import { selectAgent, timeAgo } from '../digital-company/agentSelection'
import { setActivityOpen, setComplianceOpen, setControlCenterOpen, setFinOpsOpen, subscribeControlCenter } from '../digital-company/controlCenter'
import { getHermesKanbanUrl } from '../digital-company/hermesLinks'

interface Item {
  taskId: string
  title: string
  status: string
  agentId: string | null
  agentName: string | null
  projectId: string | null
  since: number | null
  approval?: 'budget' | 'security' | 'incident' | 'other'
  lastFailure?: string | null
}

interface Project {
  projectId: string
  friendly: boolean
  total: number
  open: number
  byStatus: Record<string, number>
  agents: string[]
  pendingApprovals: number
  lastActivityAt: number | null
}

interface Overview {
  generatedAt: string
  approvals: Item[]
  blocked: Item[]
  inProgress: Item[]
  review: Item[]
  waiting: Item[]
  triage: Item[]
  projects: Project[]
}

const REFRESH_MS = 5000

const APPROVAL_COLOR: Record<string, string> = {
  budget: '#f59e0b',
  security: '#ef4444',
  incident: '#f97316',
  other: '#a855f7',
}

const Panel = styled.section`
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(168, 85, 247, 0.45);
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
    color: #c4b5fd;
  }
  p {
    margin: 2px 0 0;
    color: #94a3b8;
  }
  button {
    border: 1px solid rgba(196, 181, 253, 0.5);
    border-radius: 8px;
    padding: 4px 9px;
    margin-left: 6px;
    color: #c4b5fd;
    background: transparent;
    cursor: pointer;
  }
`

const Counters = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: 10px 16px;

  div {
    border-radius: 8px;
    padding: 6px;
    text-align: center;
    background: rgba(30, 41, 59, 0.8);
  }
  b {
    display: block;
    font-size: 18px;
  }
  span {
    font-size: 10px;
    color: #94a3b8;
  }
`

const Section = styled.div`
  padding: 8px 16px 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);

  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
`

const Row = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 2px 8px;
  align-items: center;
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
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  small {
    color: #94a3b8;
  }
  .meta {
    grid-column: 2 / 4;
  }
  .fail {
    grid-column: 1 / 4;
    color: #fecaca;
  }
`

const Badge = styled.span<{ $color: string }>`
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 700;
  color: #0f172a;
  background: ${({ $color }) => $color};
`

const Empty = styled.div`
  color: #64748b;
`

const ProjectRow = styled.div`
  display: grid;
  grid-template-columns: 90px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);

  b {
    color: #5eead4;
  }
  small {
    color: #94a3b8;
  }
`

const Offline = styled.div`
  margin: 10px 16px;
  border-left: 3px solid #ef4444;
  padding: 6px 8px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.12);
`

function ItemRow({ item, badge }: { item: Item; badge?: { label: string; color: string } }) {
  return (
    <Row type="button" onClick={() => item.agentId && selectAgent(item.agentId)} title="Show agent details">
      {badge ? <Badge $color={badge.color}>{badge.label}</Badge> : <span />}
      <strong title={item.title}>{item.title}</strong>
      <small>{timeAgo(item.since)}</small>
      <small className="meta">
        {item.agentName || 'unassigned'} · {item.projectId || 'no project'} · Kanban {item.taskId}
      </small>
      {item.lastFailure && <small className="fail">Last failure: {item.lastFailure}</small>}
    </Row>
  )
}

function ItemSection({ title, items, empty, badge }: {
  title: string
  items: Item[]
  empty: string
  badge?: (i: Item) => { label: string; color: string } | undefined
}) {
  return (
    <Section>
      <h3>
        {title} ({items.length})
      </h3>
      {items.length ? items.map((i) => <ItemRow key={i.taskId} item={i} badge={badge?.(i)} />) : <Empty>{empty}</Empty>}
    </Section>
  )
}

/**
 * John's Control Center: decisions waiting for Ionut, blockers, work in
 * progress, Goku's review queue and projects. Read-only, polled from the
 * Office API (no LLM calls).
 */
export default function ControlCenterPanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeControlCenter(setOpen), [])

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const body = await apiGet<Overview>('/overview')
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
    <Panel aria-label="Control Center">
      <Header>
        <div>
          <h2>John · Control Center</h2>
          <p>{error ? 'Hermes Kanban unavailable' : data ? `Live from Hermes Kanban · ${new Date(data.generatedAt).toLocaleTimeString()}` : 'Loading…'}</p>
        </div>
        <div>
          <button type="button" onClick={() => setFinOpsOpen(true)}>
            FinOps
          </button>
          <button type="button" onClick={() => setComplianceOpen(true)}>
            Compliance
          </button>
          <button type="button" onClick={() => setActivityOpen(true)}>
            Activity
          </button>
          <button type="button" onClick={() => window.open(getHermesKanbanUrl(), '_blank', 'noopener,noreferrer')}>
            Kanban
          </button>
          <button type="button" onClick={() => setControlCenterOpen(false)} title="Close">
            ✕
          </button>
        </div>
      </Header>

      {error && <Offline>{error}. Data is not live; nothing is shown as current.</Offline>}

      {data && !error && (
        <>
          <Counters>
            <div>
              <b style={{ color: '#c4b5fd' }}>{data.approvals.length}</b>
              <span>Need Ionut</span>
            </div>
            <div>
              <b style={{ color: '#f87171' }}>{data.blocked.length}</b>
              <span>Blocked</span>
            </div>
            <div>
              <b style={{ color: '#4ade80' }}>{data.inProgress.length}</b>
              <span>In progress</span>
            </div>
            <div>
              <b style={{ color: '#60a5fa' }}>{data.review.length}</b>
              <span>In review</span>
            </div>
            <div>
              <b style={{ color: '#facc15' }}>{data.waiting.length}</b>
              <span>Waiting</span>
            </div>
          </Counters>

          <ItemSection
            title="Decisions waiting for Ionut"
            items={data.approvals}
            empty="Nothing needs your decision."
            badge={(i) => (i.approval ? { label: i.approval, color: APPROVAL_COLOR[i.approval] } : undefined)}
          />
          <ItemSection title="Blocked" items={data.blocked} empty="No blockers." />
          <ItemSection title="Goku's review queue" items={data.review} empty="Review queue is empty." />
          <ItemSection title="In progress" items={data.inProgress} empty="No agent is working right now." />

          <Section>
            <h3>Projects ({data.projects.length})</h3>
            {data.projects.length ? (
              data.projects.map((p) => (
                <ProjectRow key={p.projectId}>
                  <b>{p.projectId}</b>
                  <small>
                    {p.open} open / {p.total} total
                    {p.pendingApprovals ? ` · ${p.pendingApprovals} awaiting Ionut` : ''}
                    {p.agents.length ? ` · ${p.agents.join(', ')}` : ''}
                  </small>
                  <small>{timeAgo(p.lastActivityAt)}</small>
                </ProjectRow>
              ))
            ) : (
              <Empty>No projects on the board yet.</Empty>
            )}
          </Section>
        </>
      )}
    </Panel>
  )
}
