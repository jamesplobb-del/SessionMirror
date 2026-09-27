import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Render the real multitrack picker with a Vault containing both kinds of take.
const dir = await mkdtemp('scripts/practice-qa/regressions/.multitrack-vault-')
try {
  const outfile = join(dir, 'picker.mjs')
  await build({
    entryPoints: ['src/multitrack/takeVault/MultitrackTakePicker.tsx'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    plugins: [{ name: 'portal-for-render', setup(build) {
      build.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'portal', namespace: 'qa' }))
      build.onLoad({ filter: /^portal$/, namespace: 'qa' }, () => ({ contents: 'export const createPortal = node => node', loader: 'js' }))
    } }],
  })
  globalThis.document = { body: {} }
  const { default: MultitrackTakePicker } = await import(pathToFileURL(outfile).href)
  const takes = [
    { id: 'audio', name: 'Audio practice', mediaType: 'audio', videoMimeType: 'audio/mp4', duration: 4 },
    { id: 'video', name: 'Video practice', mediaType: 'video', videoMimeType: 'video/mp4', duration: 5 },
  ]
  const html = renderToStaticMarkup(React.createElement(MultitrackTakePicker, {
    isOpen: true, takes, onClose() {}, onSelectTake() {},
  }))
  assert.ok(html.includes('Audio practice') && html.includes('Video practice'), 'Vault picker must show both audio and video')
  assert.ok(html.includes('Audio ·') && html.includes('Video ·'), 'Each take should identify its media type')
  console.log('PASS: multitrack Take Vault picker shows audio and video takes')
} finally {
  delete globalThis.document
  await rm(dir, { recursive: true, force: true })
}
