import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: true,
  },
  define: {
    // Tags Sentry events with the app version so you can tell which build a
    // crash came from.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // NOTE: console.* is deliberately NOT stripped from production builds.
  // Sentry turns console calls into breadcrumbs, which are only transmitted
  // when an error is actually captured — so your existing diagnostic logging
  // becomes the trail leading up to a user's crash. Dropping it would leave
  // you with a stack trace and no context.
  esbuild: command === 'build' ? { drop: ['debugger'] } : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('@capacitor-community/sqlite') || id.includes('jeep-sqlite')) {
            return 'sqlite'
          }
          if (id.includes('@capacitor')) return 'capacitor'
          return 'vendor'
        },
      },
    },
  },
}))
