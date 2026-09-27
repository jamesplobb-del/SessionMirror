import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', 'ios/App/App/Info.plist'], { encoding: 'utf8' }))
const documentTypes = new Set(plist.CFBundleDocumentTypes.flatMap(entry => entry.LSItemContentTypes))
for (const type of ['com.adobe.pdf', 'com.besttake.app.multitrack', 'com.besttake.app.practice-plan', 'com.besttake.app.routine']) {
  assert.ok(documentTypes.has(type), `${type} must appear in iOS Open In`)
}
for (const type of plist.UTExportedTypeDeclarations) {
  assert.ok(type.UTTypeConformsTo.includes('public.data'), `${type.UTTypeIdentifier} must be a document`)
  const mime = type.UTTypeTagSpecification['public.mime-type']
  assert.match(Array.isArray(mime) ? mime[0] : mime, /^application\/vnd\.besttake\./)
}

const dir = await mkdtemp(join(tmpdir(), 'besttake-document-handoff-'))
try {
  const listeners = []
  const deleted = []
  globalThis.testDocumentApp = {
    addListener: async (_event, listener) => { listeners.push(listener) },
    getLaunchUrl: async () => ({ url: 'file:///Documents/Inbox/Concert%20Etude.PDF' }),
  }
  globalThis.testDocumentFs = { deleteFile: async ({ path }) => { deleted.push(path) } }
  await build({
    entryPoints: ['src/utils/incomingPdfOpen.ts'], outfile: join(dir, 'incoming.mjs'),
    bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'native-handoff', setup(plugin) {
      plugin.onResolve({ filter: /^@capacitor\/(app|core|filesystem)$/ }, args => ({ path: args.path, namespace: 'double' }))
      plugin.onLoad({ filter: /.*/, namespace: 'double' }, ({ path }) => ({
        contents: path.endsWith('/app') ? 'export const App=globalThis.testDocumentApp'
          : path.endsWith('/core') ? 'export const Capacitor={isNativePlatform:()=>true}'
          : 'export const Filesystem=globalThis.testDocumentFs',
        loader: 'js',
      }))
    } }],
  })
  const handoff = await import(pathToFileURL(join(dir, 'incoming.mjs')))
  let notified = 0
  handoff.subscribePdfOpen(() => { notified++ })
  await handoff.initializePdfFileOpen()
  assert.equal(notified, 1)
  assert.deepEqual(handoff.consumePendingPdfOpen(), { url: 'file:///Documents/Inbox/Concert%20Etude.PDF', name: 'Concert Etude.PDF' })
  listeners[0]({ url: 'file:///Documents/Inbox/Concert%20Etude.PDF' })
  listeners[0]({ url: 'file:///Documents/Inbox/shared.btplan' })
  assert.equal(handoff.getPendingPdfOpen(), null)
  listeners[0]({ url: 'file:///Documents/Inbox/Next.pdf' })
  assert.equal(handoff.getPendingPdfOpen()?.name, 'Next.pdf')
  await handoff.discardOpenedPdfCopy('file:///Documents/Inbox/Concert%20Etude.PDF')
  await handoff.discardOpenedPdfCopy('file:///Documents/Other/keep.pdf')
  assert.deepEqual(deleted, ['file:///Documents/Inbox/Concert%20Etude.PDF'])
  console.log('PASS: iOS registers PDF and BestTake files; cold and warm PDF handoffs route once and clean Inbox copies')
} finally {
  delete globalThis.testDocumentApp
  delete globalThis.testDocumentFs
  await rm(dir, { recursive: true, force: true })
}
