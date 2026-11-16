import { useEffect, useState } from 'react'
import { apiGet } from './api'

import { AgentStatus } from './agentStatus'
import { publishAgentStatus } from './agentStatusStore'

export interface HermesAgentTask {
  id: string
  title: string
  status: string
  projectId: string | null
  lastFailure: string | null
  /** Set when the task awaits Ionut's decision (HUMAN_APPROVAL block). */
  approval?: 'budget' | 'security' | 'incident' | 'other' | null
}

export interface HermesAgentState {
  id: string
  name: string
  profile: string
  status: AgentStatus
  task: HermesAgentTask | null
}

interface HermesAgentsResponse {
  source: string
  generatedAt: string
  agents: HermesAgentState[]
}

const POLL_INTERVAL_MS = 5000

export function useHermesAgents() {
  const [agents, setAgents] = useState<HermesAgentState[]>([])
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function refresh() {
      try {
        const data = await apiGet<HermesAgentsResponse>('/agents')

        if (!active) return

        setAgents(data.agents)
        setConnected(true)
        setLastUpdated(data.generatedAt)
        publishAgentStatus({
          connected: true,
          agents: data.agents.map((a) => ({ id: a.id, status: a.status, taskTitle: a.task?.title ?? null })),
          receivedAt: Date.now(),
        })
      } catch (error) {
        console.error('Unable to read Hermes agent status:', error)

        if (!active) return

        setConnected(false)
        publishAgentStatus({ connected: false, agents: [], receivedAt: Date.now() })
      }
    }

    refresh()

    const timer = window.setInterval(
      refresh,
      POLL_INTERVAL_MS
    )

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return {
    agents,
    connected,
    lastUpdated,
  }
}


