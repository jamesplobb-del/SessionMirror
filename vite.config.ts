import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// Source map upload. Without this, a production JS crash in Sentry is an
// unreadable minified frame (`App-CaDl.js:1:84210`) instead of a file and line.
// Inert unless SENTRY_AUTH_TOKEN is exported, so ordinary builds are unaffected.
// The release name MUST stay in sync with `release` in src/utils/crashReporting.ts.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    ...(command === 'build' && sentryAuthToken
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT ?? 'besttake',
            release: { name: `besttake@${pkg.version}` },
            sourcemaps: {
              // Upload, then delete — shipping maps inside the app bundle would
              // hand the full unminified source to anyone who unzips the .ipa.
              filesToDeleteAfterUpload: ['dist/**/*.map'],
            },
          }),
        ]
      : []),
  ],
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
    // Only generated when we're actually uploading them; the plugin deletes
    // them from dist afterwards so they never reach the App Store binary.
    sourcemap: command === 'build' && Boolean(sentryAuthToken),
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
