import React, { useState } from 'react'
import styled from 'styled-components'

import { digitalCompanyAgents } from '../digital-company/agents'
import { useHermesAgents } from '../digital-company/useHermesAgents'
import {
  AgentStatus,
  agentStatusColor,
  agentStatusLabel,
} from '../digital-company/agentStatus'
import {
  getHermesKanbanUrl,
  getHermesProfileUrl,
} from '../digital-company/hermesLinks'

const Panel = styled.aside`
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 1000;
  width: 340px;
  max-height: calc(100vh - 36px);
  overflow: hidden;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(94, 234, 212, 0.35);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
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
    color: #5eead4;
  }

  p {
    margin: 3px 0 0;
    font-size: 11px;
    color: #94a3b8;
  }
`

const Toggle = styled.button`
  border: 1px solid rgba(94, 234, 212, 0.4);
  border-radius: 8px;
  padding: 5px 9px;
  color: #5eead4;
  background: transparent;
  cursor: pointer;
`

const AgentList = styled.div`
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  padding: 8px;
`

const AgentCard = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 9px;
  margin-bottom: 5px;
  padding: 9px 10px;
  text-align: left;
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.74);
  cursor: pointer;

  &:hover {
    background: rgba(51, 65, 85, 0.95);
  }
`

const StatusDot = styled.span<{ $color: string }>`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  box-shadow: 0 0 8px ${({ $color }) => $color};
`

const AgentInfo = styled.span`
  display: flex;
  min-width: 0;
  flex-direction: column;

  strong {
    font-size: 13px;
  }

  small {
    overflow: hidden;
    font-size: 10px;
    color: #94a3b8;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const StatusText = styled.span`
  font-size: 9px;
  text-transform: uppercase;
  color: #cbd5e1;
`

const Footer = styled.div`
  padding: 10px 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);

  button {
    width: 100%;
    border: 1px solid #14b8a6;
    border-radius: 8px;
    padding: 8px;
    color: #0f172a;
    background: #5eead4;
    font-weight: 700;
    cursor: pointer;
  }
`

export default function AgentRosterPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const { agents: hermesAgents, connected } = useHermesAgents()

  const agents = digitalCompanyAgents.map((agent) => {
    const live = hermesAgents.find(
      (item) => item.profile === agent.hermesProfile
    )

    return {
      ...agent,
      status: connected
        ? live?.status || agent.status
        : AgentStatus.OFFLINE,
      task: live?.task || null,
    }
  })

  return (
    <Panel>
      <Header>
        <div>
          <h2>Digital Company HQ</h2>
          <p>
            {connected
              ? 'Hermes Kanban connected · live status'
              : 'Hermes Kanban unavailable'}
          </p>
        </div>

        <Toggle
          type="button"
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? 'Open' : 'Hide'}
        </Toggle>
      </Header>

      {!collapsed && (
        <>
          <AgentList>
            {agents.map((agent) => (
              <AgentCard
                type="button"
                key={agent.id}
                title={`Open ${agent.name} in Hermes`}
                onClick={() =>
                  window.open(
                    getHermesProfileUrl(agent.hermesProfile),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <StatusDot
                  $color={agentStatusColor[agent.status]}
                />

                <AgentInfo>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </AgentInfo>

                <StatusText>
                  {agentStatusLabel[agent.status]}
                </StatusText>
              </AgentCard>
            ))}
          </AgentList>

          <Footer>
            <button
              type="button"
              onClick={() =>
                window.open(
                  getHermesKanbanUrl(),
                  '_blank',
                  'noopener,noreferrer'
                )
              }
            >
              Open Hermes Kanban
            </button>
          </Footer>
        </>
      )}
    </Panel>
  )
}

