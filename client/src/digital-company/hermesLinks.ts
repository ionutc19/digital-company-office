const HERMES_DASHBOARD_URL = 'http://127.0.0.1:9119'

export function getHermesProfileUrl(profile: string): string {
  return `${HERMES_DASHBOARD_URL}/chat?profile=${encodeURIComponent(profile)}`
}

export function getHermesSkillsUrl(profile: string): string {
  return `${HERMES_DASHBOARD_URL}/skills?profile=${encodeURIComponent(profile)}`
}

export function getHermesKanbanUrl(): string {
  return `${HERMES_DASHBOARD_URL}/kanban`
}
