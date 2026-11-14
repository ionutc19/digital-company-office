import React, { useEffect, useState } from 'react'
import { apiGet } from '../digital-company/api'
import styled from 'styled-components'

import { selectAgent, timeAgo } from '../digital-company/agentSelection'
import { setActivityOpen, subscribeActivity } from '../digital-company/controlCenter'

interface ActivityEvent {
  id: number
  taskId: string
  title: string | null
  agentId: string | null
  agentName: string | null
  projectId: string | null
  kind: string
  summary: string
  createdAt: number
}

interface ActivityData {
  connected: boolean
  reason: string | null
  events: ActivityEvent[]
}

interface ItsmData {
  kanbanAvailable: boolean
  projectMemoryError: string | null
  rooms: Array<{
    type: string
    projects: Array<{
      projectId: string
      name: string | null
      changeType: string
      riskLevel: string | null
      openTasks: number
      blocked: number
      awaitingIonut: number
    }>
  }>
}

const REFRESH_MS = 5000

const ROOM_STYLE: Record<string, { label: string; color: string }> = {
  INCIDENT: { label: 'Incidents', color: '#f87171' },
  PROBLEM: { label: 'Problems', color: '#fb923c' },
  CHANGE: { label: 'Changes', color: '#facc15' },
  REQUEST: { label: 'Requests', color: '#60a5fa' },
  PROJECT: { label: 'Projects', color: '#5eead4' },
  UNCLASSIFIED: { label: 'Unclassified', color: '#94a3b8' },
}

const KIND_COLOR: Record<string, string> = {
  blocked: '#f87171',
  completed: '#4ade80',
  review_requested: '#60a5fa',
  changes_requested: '#fb923c',
  gave_up: '#f87171',
  crashed: '#f87171',
  timed_out: '#f87171',
  unblocked: '#a3e635',
  created: '#94a3b8',
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
  border: 1px solid rgba(250, 204, 21, 0.4);
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
    color: #fde68a;
  }
  p {
    margin: 2px 0 0;
    color: #94a3b8;
  }
  button {
    border: 1px solid rgba(253, 230, 138, 0.5);
    border-radius: 8px;
    padding: 4px 9px;
    color: #fde68a;
    background: transparent;
    cursor: pointer;
  }
`

const Rooms = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 16px;
`

const Room = styled.div<{ $color: string }>`
  border: 1px solid ${({ $color }) => $color}55;
  border-top: 3px solid ${({ $color }) => $color};
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(30, 41, 59, 0.7);
  min-height: 56px;

  h4 {
    margin: 0 0 4px;
    font-size: 11px;
    color: ${({ $color }) => $color};
  }
  div {
    font-size: 11px;
    margin: 2px 0;
  }
  small {
    color: #94a3b8;
  }
`

const Section = styled.div`
  padding: 8px 16px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);

  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
`

const EventRow = styled.button<{ $color: string }>`
  width: 100%;
  display: grid;
  grid-template-columns: 8px 1fr auto;
  gap: 2px 8px;
  align-items: start;
  border: 0;
  border-radius: 6px;
  padding: 5px 6px;
  text-align: left;
  color: #e2e8f0;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: rgba(51, 65, 85, 0.7);
  }
  i {
    width: 8px;
    height: 8px;
    margin-top: 4px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
  }
  small {
    color: #94a3b8;
  }
  .meta {
    grid-column: 2 / 4;
  }
`

const Note = styled.div`
  margin: 8px 16px 0;
  border-left: 3px solid #eab308;
  padding: 6px 8px;
  color: #fef08a;
  background: rgba(234, 179, 8, 0.1);
`

const Muted = styled.div`
  color: #64748b;
`

/**
 * ITSM rooms (Project Memory classification) and the live activity timeline
 * (Hermes Kanban event stream). Read-only, no LLM calls.
 */
export default function ActivityPanel() {
  const [open, setOpen] = useState(false)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [itsm, setItsm] = useState<ItsmData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeActivity(setOpen), [])

  useEffect(() => {
    if (!open) return
    let active = true
    const load = async () => {
      try {
        const [ad, id] = await Promise.all([apiGet<ActivityData>('/activity?limit=100'), apiGet<ItsmData>('/itsm')])
        if (active) {
          setActivity(ad)
          setItsm(id)
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
    <Panel aria-label="Activity">
      <Header>
        <div>
          <h2>Activity &amp; ITSM</h2>
          <p>Sources: Hermes Kanban event stream and Project Memory</p>
        </div>
        <button type="button" onClick={() => setActivityOpen(false)} title="Close">
          ✕
        </button>
      </Header>

      {error && <Note>Office API error: {error}</Note>}
      {itsm?.projectMemoryError && <Note>{itsm.projectMemoryError}</Note>}

      {itsm && (
        <Rooms>
          {itsm.rooms
            .filter((r) => r.type !== 'UNCLASSIFIED' || r.projects.length > 0)
            .map((r) => {
              const style = ROOM_STYLE[r.type] || ROOM_STYLE.UNCLASSIFIED
              return (
                <Room key={r.type} $color={style.color}>
                  <h4>
                    {style.label} ({r.projects.length})
                  </h4>
                  {r.projects.length ? (
                    r.projects.map((p) => (
                      <div key={p.projectId} title={p.name || ''}>
                        <b>{p.projectId}</b>{' '}
                        <small>
                          {p.openTasks} open
                          {p.blocked ? ` · ${p.blocked} blocked` : ''}
                          {p.awaitingIonut ? ` · ${p.awaitingIonut} need Ionut` : ''}
                          {r.type === 'CHANGE' && p.changeType !== 'N/A' ? ` · ${p.changeType.toLowerCase()}` : ''}
                          {p.riskLevel ? ` · risk ${p.riskLevel}` : ''}
                        </small>
                      </div>
                    ))
                  ) : (
                    <small>none</small>
                  )}
                </Room>
              )
            })}
        </Rooms>
      )}

      <Section>
        <h3>Timeline</h3>
        {activity && !activity.connected && (
          <Note style={{ margin: '0 0 8px' }}>
            Live event stream not connected{activity.reason ? `: ${activity.reason}` : ''}.
          </Note>
        )}
        {activity && activity.events.length ? (
          activity.events.map((e) => (
            <EventRow
              key={e.id}
              type="button"
              $color={KIND_COLOR[e.kind] || '#cbd5e1'}
              onClick={() => e.agentId && selectAgent(e.agentId)}
            >
              <i />
              <span>
                <b>{e.agentName || 'Someone'}</b> {e.summary}
              </span>
              <small>{timeAgo(e.createdAt)}</small>
              <small className="meta">
                {e.title || e.taskId}
                {e.projectId ? ` · ${e.projectId}` : ''}
              </small>
            </EventRow>
          ))
        ) : (
          <Muted>{activity ? 'No activity yet.' : 'Loading…'}</Muted>
        )}
      </Section>
    </Panel>
  )
}
