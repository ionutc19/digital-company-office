/**
 * Standalone development app: the same Office view as the Hermes Dashboard
 * tab, fed by the local Express adapter (/api/digital-company, see
 * server/digital-company). Production runs inside the Dashboard plugin.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'

import OfficeView from './office/OfficeView'

const container = document.getElementById('root') as HTMLElement
document.body.style.margin = '0'
document.body.style.background = '#020617'
createRoot(container).render(
  <React.StrictMode>
    <OfficeView assetBase="/assets/" height="100vh" />
  </React.StrictMode>
)
