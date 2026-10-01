// Run with: node scripts/verify-library-audio-reference-hint.mjs
// Covers the one-use URL produced by native import and verifies later hydration
// still checks that the persisted file exists.
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const counts = { writes: 0, uriReads: 0, stats: 0, deletes: 0 }
let fileExists = false
const ports = {
  '@capacitor/core': `export const Capacitor = { isNativePlatform: () => true, convertFileSrc: uri => 'capacitor://localhost/_capacitor_file_' + uri }`,
  '@capacitor/filesystem': `export const Directory = { Data: 'DATA' }; export const Filesystem = {
    writeFile: async () => { globalThis.__counts.writes++; globalThis.__exists = true },
    getUri: async ({path}) => { globalThis.__counts.uriReads++; return { uri: 'file:///container/' + path } },
  }`,
  './filesystemInit': `export const LIBRARY_DIR = 'library'; export const initAppFilesystem = async () => {};
    export const nativeDataFileExists = async () => { globalThis.__counts.stats++; return globalThis.__exists }`,
  './takeStorage': `export const NATIVE_AUDIO_MIME = 'audio/mp4'; export const normalizeBlobMime = x => x;
    export const applyStrictPlaybackSrc = x => x; export const deleteTakeFile = async () => {
      globalThis.__counts.deletes++; globalThis.__exists = false
    }`,
}
const built = await build({
  entryPoints: ['src/utils/libraryStorage.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'native-import-ports', setup(build) {
    build.onResolve({ filter: /.*/ }, args => ports[args.path] ? { path: args.path, namespace: 'native-port' } : undefined)
    build.onLoad({ filter: /.*/, namespace: 'native-port' }, args => ({ contents: ports[args.path], loader: 'js' }))
  } }],
})
globalThis.__counts = counts
globalThis.__exists = fileExists
class TestFileReader {
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onloadend?.()
  }
}
globalThis.FileReader = TestFileReader
const storage = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const imported = await storage.persistLibraryAudio(new Blob(['fresh audio'], { type: 'audio/wav' }), 'fresh', 'audio/wav')
assert.equal(counts.writes, 1)
assert.equal(counts.uriReads, 1, 'persist returns the import URI')
const hydrated = await storage.resolveLibraryPlaybackUrl(imported.filePath, '')
assert.equal(hydrated, imported.playbackUrl)
assert.equal(counts.stats, 0, 'the first post-import hydration reuses the verified import URI')
assert.equal(counts.uriReads, 1, 'the first post-import hydration avoids a duplicate URI lookup')
await storage.resolveLibraryPlaybackUrl(imported.filePath, '')
assert.equal(counts.stats, 1, 'later hydration returns to checking native file existence')
assert.equal(counts.uriReads, 2, 'later hydration resolves a fresh URI after verification')
await storage.persistLibraryAudio(new Blob(['delete before hydration'], { type: 'audio/wav' }), 'pending', 'audio/wav')
await storage.deleteLibraryFile('library/pending.wav')
assert.equal(await storage.resolveLibraryPlaybackUrl('library/pending.wav', ''), '', 'deleting an unconsumed import clears its one-use hint')
console.log('PASS: native import hydration skips one redundant stat/URI pair; later reads verify the file; deletion clears the hint.')
