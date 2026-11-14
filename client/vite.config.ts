import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: Node 17+ may resolve localhost to ::1 while
        // the backend listens on IPv4 loopback only.
        target: 'http://127.0.0.1:2567',
        changeOrigin: true,
      },
    },
  },
})
