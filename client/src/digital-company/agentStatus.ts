export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  REVIEWING = 'reviewing',
  WAITING = 'waiting',
  BLOCKED = 'blocked',
  HUMAN_APPROVAL = 'human-approval',
  OFFLINE = 'offline',
}

export const agentStatusLabel: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: 'Idle',
  [AgentStatus.WORKING]: 'Working',
  [AgentStatus.REVIEWING]: 'Reviewing',
  [AgentStatus.WAITING]: 'Waiting',
  [AgentStatus.BLOCKED]: 'Blocked',
  [AgentStatus.HUMAN_APPROVAL]: 'Human Approval',
  [AgentStatus.OFFLINE]: 'Offline',
}

export const agentStatusColor: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: '#94a3b8',
  [AgentStatus.WORKING]: '#22c55e',
  [AgentStatus.REVIEWING]: '#3b82f6',
  [AgentStatus.WAITING]: '#eab308',
  [AgentStatus.BLOCKED]: '#ef4444',
  [AgentStatus.HUMAN_APPROVAL]: '#a855f7',
  [AgentStatus.OFFLINE]: '#475569',
}
