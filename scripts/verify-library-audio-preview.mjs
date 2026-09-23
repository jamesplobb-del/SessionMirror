// Browser audio references must have an identity accepted by the library repository.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const ports = {
  '@capacitor/core': 'export const Capacitor={isNativePlatform:()=>false}',
  '@capacitor/filesystem': 'export const Directory={}; export const Filesystem={}',
  './filesystemInit': 'export const LIBRARY_DIR="library"; export const initAppFilesystem=()=>{throw Error("Unexpected native filesystem")}; export const nativeDataFileExists=()=>false',
  './takeStorage': 'export const NATIVE_AUDIO_MIME="audio/mp4"; export const normalizeBlobMime=x=>x; export const applyStrictPlaybackSrc=x=>x; export const deleteTakeFile=()=>{throw Error("Unexpected native deletion")}',
}
const result = await build({ entryPoints:['src/utils/libraryStorage.ts'], bundle:true, write:false, platform:'node', format:'esm', plugins:[{name:'platform-ports', setup(b){
  b.onResolve({filter:/.*/},args=>ports[args.path] ? {path:args.path,namespace:'port'} : undefined)
  b.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path]}))
}}] })
const storage = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const first = await storage.persistLibraryAudio(new Blob(['first'],{type:'audio/wav'}),'first','audio/wav')
const second = await storage.persistLibraryAudio(new Blob(['second'],{type:'audio/mpeg'}),'second','audio/mpeg')
assert.equal(first.filePath, 'library/first.wav')
assert.equal(second.filePath, 'library/second.mp3')
assert.equal(await storage.resolveLibraryPlaybackUrl(first.filePath,''),first.playbackUrl)
assert.equal(await (await fetch(first.playbackUrl)).text(),'first')
assert.equal(await storage.resolveLibraryPlaybackUrl(second.filePath,''),second.playbackUrl)
const replaced = await storage.persistLibraryAudio(new Blob(['replacement'],{type:'audio/wav'}),'first','audio/wav')
await assert.rejects(fetch(first.playbackUrl), 'Replacing a reference releases the old object URL')
assert.equal(await storage.resolveLibraryPlaybackUrl(first.filePath,''),replaced.playbackUrl)
await storage.deleteLibraryFile(first.filePath)
assert.equal(await storage.resolveLibraryPlaybackUrl(first.filePath,''),'')
await assert.rejects(fetch(replaced.playbackUrl))
assert.equal(await storage.resolveLibraryPlaybackUrl(second.filePath,''),second.playbackUrl,'Other references survive deleting one file')
await storage.deleteLibraryFile(second.filePath)
console.log('PASS: browser reference identity, playback hydration, replacement, deletion, and isolation')
