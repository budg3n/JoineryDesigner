import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  define: {
    __BUILD_TIME__: JSON.stringify('2026-05-10T11:05:37Z'),
  },

  build: {
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Content-hashed filenames — browser never serves stale chunks
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',

        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'react-core'
          }
          if (id.includes('node_modules/react-router')) return 'router'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/date-fns')) return 'dates'
          if (id.includes('/screens/JobDetail')) return 'screen-job'
          if (id.includes('/screens/Materials') || id.includes('/screens/OrderSheet')) return 'screen-inventory'
          if (id.includes('/screens/FormulaWriter')) return 'screen-formula'
          if (id.includes('/screens/Notes') || id.includes('/screens/Sketch')) return 'screen-notes'
          if (id.includes('/screens/OnSite') || id.includes('/screens/SpecBuilder')) return 'screen-onsite'
        },
      },
    },

    sourcemap: false,
    minify: 'esbuild',
  },

  server: {
    port: 5173,
    hmr: { overlay: true },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
  },

  esbuild: {
    legalComments: 'none',
    drop: ['console', 'debugger'],
  },
})

