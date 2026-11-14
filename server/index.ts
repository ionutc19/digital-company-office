import http from 'http'
import express from 'express'
import cors from 'cors'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
import { RoomType } from '../types/Rooms'

// import socialRoutes from "@colyseus/social/express"

import { SkyOffice } from './rooms/SkyOffice'
import digitalCompanyRouter from './digital-company/router'

const port = Number(process.env.PORT || 2567)
// Local cockpit: bind to loopback unless explicitly overridden.
const host = process.env.HOST || '127.0.0.1'
const allowedOrigins = (
  process.env.DC_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
)
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
// app.use(express.static('dist'))

const server = http.createServer(app)
const gameServer = new Server({
  server,
})

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, SkyOffice, {
  name: 'Digital Company HQ',
  description: 'AI operations, governance and engineering control center',
  password: null,
  autoDispose: false,
})
gameServer.define(RoomType.CUSTOM, SkyOffice).enableRealtimeListing()

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/server/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

// Colyseus monitor has no authentication: opt-in only, for local debugging.
// Register it AFTER the room handlers.
if (process.env.ENABLE_COLYSEUS_MONITOR === '1') {
  app.use('/colyseus', monitor())
}

gameServer.listen(port, host).then(() => {
  console.log(`Listening on ws://${host}:${port}`)
})

