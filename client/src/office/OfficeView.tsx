/**
 * The Office view: read-only map with the 11 agent NPCs plus all panels.
 * Shared by the Hermes Dashboard plugin (Office tab) and the standalone
 * development app. Where data comes from is decided by api.ts.
 */
import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'

import AgentRosterPanel from '../components/AgentRosterPanel'
import AgentDetailPanel from '../components/AgentDetailPanel'
import ControlCenterPanel from '../components/ControlCenterPanel'
import FinOpsPanel from '../components/FinOpsPanel'
import CompliancePanel from '../components/CompliancePanel'
import ActivityPanel from '../components/ActivityPanel'
import OfficeViewScene from './OfficeViewScene'

export default function OfficeView({ assetBase, height }: { assetBase: string; height: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return undefined
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      pixelArt: true,
      backgroundColor: '#0f172a',
      scale: { mode: Phaser.Scale.RESIZE, width: host.current.clientWidth, height: host.current.clientHeight },
      scene: [new OfficeViewScene(assetBase)],
    })
    return () => game.destroy(true)
  }, [assetBase])

  return (
    <div
      data-dc-office=""
      style={{
        position: 'relative',
        height,
        minHeight: 560,
        overflow: 'hidden',
        borderRadius: 12,
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        // Makes the panels' `position: fixed` relative to this view, not the page.
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
