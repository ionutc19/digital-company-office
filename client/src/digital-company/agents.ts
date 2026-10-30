import { AgentStatus } from './agentStatus'

export interface DigitalCompanyAgent {
  id: string
  name: string
  role: string
  manager?: string
  status: AgentStatus
  hermesProfile: string
}

export const digitalCompanyAgents: DigitalCompanyAgent[] = [
  {
    id: 'john',
    name: 'John / TDM',
    role: 'Chief Orchestrator',
    status: AgentStatus.IDLE,
    hermesProfile: 'john-tdm',
  },
  {
    id: 'alakazam',
    name: 'Alakazam',
    role: 'Product Manager',
    manager: 'john',
    status: AgentStatus.IDLE,
    hermesProfile: 'product-manager',
  },
  {
    id: 'piccolo',
    name: 'Piccolo',
    role: 'FinOps Lead',
    manager: 'john',
    status: AgentStatus.IDLE,
    hermesProfile: 'finops-lead',
  },
  {
    id: 'bulma',
    name: 'Bulma',
    role: 'Compliance & Governance',
    manager: 'john',
    status: AgentStatus.IDLE,
    hermesProfile: 'compliance-officer',
  },
  {
    id: 'goku',
    name: 'Goku',
    role: 'Technical Supervisor',
    manager: 'john',
    status: AgentStatus.IDLE,
    hermesProfile: 'technical-supervisor',
  },
  {
    id: 'charizard',
    name: 'Charizard',
    role: 'Azure Cloud Engineer',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'cloud-engineer',
  },
  {
    id: 'pikachu',
    name: 'Pikachu',
    role: 'Network Engineer',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'network-engineer',
  },
  {
    id: 'gengar',
    name: 'Gengar',
    role: 'Security Engineer',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'security-engineer',
  },
  {
    id: 'machamp',
    name: 'Machamp',
    role: 'Infrastructure as Code',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'iac-engineer',
  },
  {
    id: 'porygon',
    name: 'Porygon',
    role: 'Platform & DevOps',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'platform-devops',
  },
  {
    id: 'psyduck',
    name: 'Psyduck',
    role: 'QA & Validation',
    manager: 'goku',
    status: AgentStatus.IDLE,
    hermesProfile: 'qa-validator',
  },
]
