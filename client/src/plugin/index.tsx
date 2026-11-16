/**
 * Hermes Dashboard plugin entry: registers the "Office" tab.
 * Built as a single IIFE (vite.plugin.config.ts). React comes from the
 * Dashboard's Plugin SDK (window.__HERMES_PLUGIN_SDK__), never bundled.
 */
import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'

import AgentRosterPanel from '../components/AgentRosterPanel'
import AgentDetailPanel from '../components/AgentDetailPanel'
import ControlCenterPanel from '../components/ControlCenterPanel'
import FinOpsPanel from '../components/FinOpsPanel'
import CompliancePanel from '../components/CompliancePanel'
import ActivityPanel from '../components/ActivityPanel'
import { setApiBackend } from '../digital-company/api'
import { createPluginBackend } from './dataSource'
import OfficeViewScene from './OfficeViewScene'

interface HermesPluginSDK {
  fetchJSON: (url: string, init?: RequestInit) => Promise<unknown>
}

declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__: HermesPluginSDK
    __HERMES_PLUGINS__: { register: (name: string, component: unknown) => void }
  }
}

const PLUGIN_NAME = 'digital-company'
const ASSET_BASE = `/dashboard-plugins/${PLUGIN_NAME}/dist/assets/`

function OfficeTab() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return undefined
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      pixelArt: true,
      backgroundColor: '#0f172a',
      scale: { mode: Phaser.Scale.RESIZE, width: host.current.clientWidth, height: host.current.clientHeight },
      scene: [new OfficeViewScene(ASSET_BASE)],
    })
    return () => game.destroy(true)
  }, [])

  return (
    <div
      data-dc-office=""
      style={{
        position: 'relative',
        height: 'calc(100vh - 140px)',
        minHeight: 560,
        overflow: 'hidden',
        borderRadius: 12,
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        // Makes the panels' `position: fixed` relative to this tab, not the page.
        transform: 'translateZ(0)',
      }}
    >
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <AgentRosterPanel />
      <AgentDetailPanel />
      <ControlCenterPanel />
      <FinOpsPanel />
      <CompliancePanel />
      <ActivityPanel />
    </div>
  )
}

// Install the data backend at load time: child components (roster) start
// polling in their own effects, which run before this component's effects.
setApiBackend(createPluginBackend((url, init) => window.__HERMES_PLUGIN_SDK__.fetchJSON(url, init)))
window.__HERMES_PLUGINS__.register(PLUGIN_NAME, OfficeTab)
