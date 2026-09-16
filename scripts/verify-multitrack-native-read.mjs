import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(tmpdir(),'multitrack-native-read-'))
try {
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 137)
  for(let i=0;i<bytes.length;i++) bytes[i]=i%251
  const calls=[]
  globalThis.testFs = {
    stat: async options => { calls.push(options); return {size:bytes.length} },
    readFile: async options => { calls.push(options); return { data: bytes.subarray(options.offset,options.offset+options.length).toString('base64') } },
  }
  await build({entryPoints:['src/multitrack/state/readMultitrackAsset.ts'],outfile:join(dir,'read.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'native-storage',setup(b){
    b.onResolve({filter:/^@capacitor\/(core|filesystem)$/},args=>({path:args.path,namespace:'double'}))
    b.onLoad({filter:/.*/,namespace:'double'},({path})=>({contents:path.endsWith('/core')?'export const Capacitor={isNativePlatform:()=>true}':'export const Directory={Data:"DATA"};export const Filesystem=globalThis.testFs',loader:'js'}))
  }}]})
  const {readMultitrackAsset}=await import(pathToFileURL(join(dir,'read.mjs')))
  const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>{throw Error('WebView URL cannot be fetched')}
  try {
    const blob=await readMultitrackAsset('capacitor://localhost/stale-video','Box 1 (Take 11)','takes/original.mov')
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes)
    assert.equal(calls[0].directory,'DATA')
    assert.equal(calls[2].offset,3*1024*1024)
    calls.length=0
    await readMultitrackAsset('capacitor://localhost/shared','Received project','file:///tmp/received.btmulti')
    assert.equal(calls[0].directory,undefined)
  } finally {globalThis.fetch=originalFetch}
  console.log('PASS: native recording and incoming project read byte-for-byte without working playback URLs; bounded chunk reads and absolute paths.')
} finally {delete globalThis.testFs;await rm(dir,{recursive:true,force:true})}
