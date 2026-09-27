import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Exercise the real MusicRoutineBuilder entry with only its child screen mocked.
// The child receives the mode that decides between saved routines and suggestions.
const tempDir = await mkdtemp('scripts/practice-qa/regressions/.suggested-entry-')
try {
  const outfile = join(tempDir, 'builder.mjs')
  await build({
    entryPoints: ['src/components/MusicRoutineBuilder.tsx'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' },
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'capture-guided-entry', setup(b) {
      b.onResolve({ filter: /^\.\/GuidedRoutineBuilder$/ }, () => ({ path: 'guided', namespace: 'qa' }))
      b.onLoad({ filter: /^guided$/, namespace: 'qa' }, () => ({
        contents: "import React from 'react'; export default function GuidedRoutineBuilder(props) { return React.createElement('output', { 'data-guided-mode': props.mode }); }",
        loader: 'js',
        resolveDir: process.cwd(),
      }))
    } }],
  })
  const { default: MusicRoutineBuilder } = await import(pathToFileURL(outfile).href)
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  for (const mode of ['presets', 'build']) {
    const html = renderToStaticMarkup(React.createElement(MusicRoutineBuilder, {
      mode, routine: null, instrumentId: 'trumpet', projects: [],
      onSave: () => {}, onCreatePracticeItem: async () => '', onDelete: () => {}, onCancel: () => {},
    }))
    assert.ok(html.includes(`data-guided-mode="${mode}"`),
      `Routine entry must preserve ${mode}; got ${html}`)
  }
  console.log('PASS: suggested routine opens suggestions; saved-routine entry still opens the library')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
