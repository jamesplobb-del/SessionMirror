import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

// Source map upload. Without this, a production JS crash in Sentry is an
// unreadable minified frame (`App-CaDl.js:1:84210`) instead of a file and line.
// The release name MUST stay in sync with `release` in src/utils/crashReporting.ts.
export default defineConfig(({ command, mode }) => {
  // Vite intentionally does not copy .env values into process.env while its
  // config is evaluated. Read the unprefixed, build-only Sentry credentials
  // explicitly so one gitignored .env file works from Terminal and Xcode.
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN ?? fileEnv.SENTRY_AUTH_TOKEN
  const sentryOrg = process.env.SENTRY_ORG ?? fileEnv.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT ?? fileEnv.SENTRY_PROJECT ?? 'besttake'
  const useHttps = fileEnv.VITE_HTTPS === 'true'

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(useHttps ? [basicSsl()] : []),
      ...(command === 'build' && sentryAuthToken
        ? [
            sentryVitePlugin({
              authToken: sentryAuthToken,
              org: sentryOrg,
              project: sentryProject,
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
  }
})
