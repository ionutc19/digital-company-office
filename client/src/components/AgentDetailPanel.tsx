import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { Event, phaserEvents } from '../events/EventCenter'
import { digitalCompanyAgents } from '../digital-company/agents'
import { AgentStatus, agentStatusColor, agentStatusLabel } from '../digital-company/agentStatus'
import { selectAgent, subscribeAgentSelection, timeAgo } from '../digital-company/agentSelection'
import { getHermesKanbanUrl, getHermesProfileUrl } from '../digital-company/hermesLinks'
import { HermesAgentState } from '../digital-company/useHermesAgents'

interface RecentTask {
  id: string
  title: string
  status: string
  projectId: string | null
  lastActivityAt: number | null
}

interface AgentDetailResponse {
  generatedAt: string
  agent: HermesAgentState & {
    task: (HermesAgentState['task'] & { approval?: string | null }) | null
  }
  recentTasks: RecentTask[]
}

const REFRESH_MS = 5000

const APPROVAL_LABEL: Record<string, string> = {
  budget: 'Budget decision',
  security: 'Security decision',
  incident: 'Incident decision',
  other: 'Decision',
}

const Panel = styled.aside`
  position: fixed;
  top: 18px;
  left: 18px;
  z-index: 1000;
  width: 360px;
  max-height: calc(100vh - 36px);
  overflow-y: auto;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(94, 234, 212, 0.35);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  font-size: 12px;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);

  h2 {
    margin: 0;
    font-size: 16px;
    color: #5eead4;
  }
  p {
    margin: 2px 0 0;
    color: #94a3b8;
  }
`

const Close = styled.button`
  align-self: flex-start;
  border: 1px solid rgba(94, 234, 212, 0.4);
  border-radius: 8px;
  padding: 4px 9px;
  color: #5eead4;
  background: transparent;
  cursor: pointer;
`

const Section = styled.section`
  padding: 10px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);

  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
`

const Chip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 3px 10px;
  font-weight: 700;
  font-size: 11px;
  color: #0f172a;
  background: ${({ $color }) => $color};
`

const Muted = styled.span`
  color: #94a3b8;
`

const Warning = styled.div`
  margin-top: 6px;
  border-left: 3px solid #ef4444;
  padding: 4px 8px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.12);
  word-break: break-word;
`

const Approval = styled.div`
  margin-top: 6px;
  border-left: 3px solid #a855f7;
  padding: 4px 8px;
  color: #e9d5ff;
  background: rgba(168, 85, 247, 0.14);
`

const TaskRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);

  strong {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    color: #94a3b8;
  }
`

const Actions = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px 16px;

  button {
    flex: 1;
    border: 1px solid #14b8a6;
    border-radius: 8px;
    padding: 7px;
    font-weight: 700;
    cursor: pointer;
    color: #0f172a;
    background: #5eead4;
  }
  button.secondary {
    color: #5eead4;
    background: transparent;
  }
`

const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/** Read-only detail view of one agent, fed by the Office API (no LLM calls). */
export default function AgentDetailPanel() {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [data, setData] = useState<AgentDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeAgentSelection(setAgentId)
    const onNpcClick = (id: string) => selectAgent(id)
    phaserEvents.on(Event.AGENT_NPC_CLICKED, onNpcClick)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectAgent(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsubscribe()
      phaserEvents.off(Event.AGENT_NPC_CLICKED, onNpcClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!agentId) {
      setData(null)
      setError(null)
      return
    }
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/digital-company/agents/${encodeURIComponent(agentId)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(res.status === 503 ? 'Hermes Kanban is unavailable' : `HTTP ${res.status}`)
        const body = (await res.json()) as AgentDetailResponse
        if (active) {
          setData(body)
          setError(null)
        }
      } catch (e) {
        if (active) setError((e as Error).message)
      }
    }
    setData(null)
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [agentId])

  if (!agentId) return null
  const def = digitalCompanyAgents.find((a) => a.id === agentId)
  if (!def) return null

  const status = (error ? AgentStatus.OFFLINE : (data?.agent.status as AgentStatus)) || AgentStatus.IDLE
  const task = error ? null : data?.agent.task ?? null

  return (
    <Panel aria-label={`${def.name} details`}>
      <Header>
        <div>
          <h2>{def.name}</h2>
          <p>{def.role}</p>
        </div>
        <Close type="button" onClick={() => selectAgent(null)} title="Close (Esc)">
          ✕
        </Close>
      </Header>

      <Section>
        <h3>Status</h3>
        <Chip $color={agentStatusColor[status]}>{agentStatusLabel[status]}</Chip>
        {error && <Warning>{error}. Showing the agent as offline.</Warning>}
        {!error && !data && <Muted> Loading…</Muted>}
      </Section>

      <Section>
        <h3>Current task</h3>
        {task ? (
          <>
            <div>
              <strong>{task.title}</strong>
            </div>
            <Muted>
              {task.projectId ? `${task.projectId} · ` : ''}Kanban {task.id} · {task.status}
            </Muted>
            {task.approval && (
              <Approval>
                Waiting for Ionut: {APPROVAL_LABEL[task.approval] || 'Decision'}. John relays the options on
                Telegram.
              </Approval>
            )}
            {task.lastFailure && <Warning>Last failure: {task.lastFailure}</Warning>}
          </>
        ) : (
          <Muted>{error ? 'Unknown while offline.' : 'No active task.'}</Muted>
        )}
      </Section>

      <Section>
        <h3>Recent tasks</h3>
        {data && data.recentTasks.length > 0 ? (
          data.recentTasks.map((t) => (
            <TaskRow key={t.id}>
              <strong title={t.title}>{t.title}</strong>
              <small>{t.status}</small>
              <small>{t.projectId || 'no project'}</small>
              <small>{timeAgo(t.lastActivityAt)}</small>
            </TaskRow>
          ))
        ) : (
          <Muted>{data ? 'No tasks yet.' : '—'}</Muted>
        )}
      </Section>

      <Actions>
        <button type="button" onClick={() => open(getHermesProfileUrl(def.hermesProfile))}>
          Chat in Hermes
        </button>
        <button type="button" className="secondary" onClick={() => open(getHermesKanbanUrl())}>
          Kanban
        </button>
      </Actions>
    </Panel>
  )
}
