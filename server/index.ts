/**
 * Standalone development server for the Digital Company Office.
 * Serves only the read-only Hermes adapter (/api/digital-company). The
 * production Office runs inside the Hermes Dashboard plugin; there is no
 * multiplayer (Colyseus) or WebRTC any more.
 */
import http from 'http'
import express from 'express'
import cors from 'cors'

import digitalCompanyRouter from './digital-company/router'

const port = Number(process.env.PORT || 2567)
// Local cockpit: bind to loopback unless explicitly overridden.
const host = process.env.HOST || '127.0.0.1'
const allowedOrigins = (process.env.DC_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const app = express()
app.use(
  cors({
    // Same-origin requests (no Origin header, e.g. via the Vite proxy) are allowed.
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  })
)
app.use(express.json())
app.use('/api/digital-company', digitalCompanyRouter)

http.createServer(app).listen(port, host, () => {
  console.log(`Digital Company dev API on http://${host}:${port}/api/digital-company`)
})
