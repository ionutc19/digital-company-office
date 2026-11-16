// Minimal typing for the `ws` client (v7.5.8, a direct dependency; no @types/ws needed).
declare module 'ws' {
  import { EventEmitter } from 'events'
  class WebSocket extends EventEmitter {
    constructor(address: string, options?: { handshakeTimeout?: number })
    close(code?: number): void
    terminate(): void
    readonly readyState: number
  }
  namespace WebSocket {
    class Server extends EventEmitter {
      constructor(options: { port?: number; host?: string })
      close(cb?: () => void): void
    }
  }
  export = WebSocket
}
