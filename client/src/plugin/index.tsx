/**
 * Hermes Dashboard plugin entry: registers the "Office" tab.
 * Built as a single IIFE (vite.plugin.config.ts). React comes from the
 * Dashboard's Plugin SDK (window.__HERMES_PLUGIN_SDK__), never bundled.
 */
import React from 'react'

import { setApiBackend } from '../digital-company/api'
import OfficeView from '../office/OfficeView'
import { createPluginBackend } from './dataSource'

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
  return <OfficeView assetBase={ASSET_BASE} height="calc(100vh - 140px)" />
}

// Install the data backend at load time: child components (roster) start
// polling in their own effects, which run before the parents' effects.
setApiBackend(createPluginBackend((url, init) => window.__HERMES_PLUGIN_SDK__.fetchJSON(url, init)))
window.__HERMES_PLUGINS__.register(PLUGIN_NAME, OfficeTab)
