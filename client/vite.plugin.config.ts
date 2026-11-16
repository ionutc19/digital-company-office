import { defineConfig } from 'vite'

/**
 * Builds the Hermes Dashboard plugin bundle (single IIFE).
 * - React/ReactDOM are externals resolved from the Dashboard Plugin SDK.
 * - Classic JSX runtime (React.createElement), so no react/jsx-runtime import.
 * - Output goes straight into hermes-plugin/digital-company/dashboard/dist.
 */
export default defineConfig({
  publicDir: false,
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '../hermes-plugin/digital-company/dashboard/dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    lib: {
      entry: 'src/plugin/index.tsx',
      name: 'DigitalCompanyOffice',
      formats: ['iife'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'window.__HERMES_PLUGIN_SDK__.React',
          'react-dom': 'window.__HERMES_PLUGIN_SDK__.ReactDOM',
        },
      },
    },
  },
})
