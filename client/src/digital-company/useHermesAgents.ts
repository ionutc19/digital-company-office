import { useEffect, useState } from 'react'

import { AgentStatus } from './agentStatus'

export interface HermesAgentTask {
  id: string
  title: string
  status: string
  projectId: string | null
  lastFailure: string | null
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
        const response = await fetch('/api/digital-company/agents', { cache: 'no-store' })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = (await response.json()) as HermesAgentsResponse

        if (!active) return

        setAgents(data.agents)
        setConnected(true)
        setLastUpdated(data.generatedAt)
      } catch (error) {
        console.error('Unable to read Hermes agent status:', error)

        if (!active) return

        setConnected(false)
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


