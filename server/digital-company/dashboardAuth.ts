/** Shared access to the local Hermes Dashboard (URL + pinned session token). */
import * as fs from 'fs'

export const DASHBOARD_URL = (process.env.DC_DASHBOARD_URL || 'http://127.0.0.1:9119').replace(/\/$/, '')

/** Token from DC_DASHBOARD_TOKEN or the user-only file written by ops/start-company.ps1. */
export function readDashboardToken(): string | null {
  if (process.env.DC_DASHBOARD_TOKEN) return process.env.DC_DASHBOARD_TOKEN
  const file = process.env.DC_DASHBOARD_TOKEN_FILE
  if (!file) return null
  try {
    const t = fs.readFileSync(file, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}
