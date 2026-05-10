import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Increase chunk size warning threshold
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Manual chunk splitting — vendor libs separate from app code
        // Browsers cache vendor chunks across deploys
        manualChunks(id) {
          // Core React — smallest possible initial chunk
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'react-core'
          }
          // Router
          if (id.includes('node_modules/react-router')) {
            return 'router'
          }
          // Supabase client
          if (id.includes('node_modules/@supabase')) {
            return 'supabase'
          }
          // Date utils
          if (id.includes('node_modules/date-fns')) {
            return 'dates'
          }
          // Heavy screens get their own chunks
          if (id.includes('/screens/JobDetail')) return 'screen-job'
          if (id.includes('/screens/Materials') || id.includes('/screens/OrderSheet')) return 'screen-inventory'
          if (id.includes('/screens/FormulaWriter')) return 'screen-formula'
          if (id.includes('/screens/Notes') || id.includes('/screens/Sketch')) return 'screen-notes'
        },
      },
    },

    // Source maps in production for error tracking
    sourcemap: false,
    // Minify with terser for smallest output
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // Strip console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
  },

  // Optimise dev server
  server: {
    port: 5173,
    hmr: { overlay: true },
  },

  // Pre-bundle these for faster cold starts
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
    exclude: [],
  },

  // Enable gzip/brotli hints in build output
  esbuild: {
    legalComments: 'none',
  },
})
