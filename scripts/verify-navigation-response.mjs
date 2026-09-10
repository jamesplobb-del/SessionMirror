import assert from 'node:assert/strict'
import { build } from 'esbuild'
const calls=[]
let releaseStyle=null, blockNextStyle=false, failNextStyle=false
const driver={
 async setOverlaysWebView(value){calls.push(['overlay',value])},
 async setStyle(value){calls.push(['style',value]);if(failNextStyle){failNextStyle=false;throw Error('temporary native failure')} if(blockNextStyle){blockNextStyle=false;await new Promise(r=>{releaseStyle=r})}},
 async setBackgroundColor(value){calls.push(['background',value])},
}
globalThis.__navigationStatusBar=driver
const plugin={name:'native-boundary',setup(b){
 b.onResolve({filter:/^@capacitor\/(core|status-bar)$/},a=>({path:a.path,namespace:'test'}))
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path.endsWith('/core') ? "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'}" : "export const StatusBar=globalThis.__navigationStatusBar; export const Style={Light:'light',Dark:'dark'}"}))
}}
const bundle=await build({entryPoints:['src/utils/nativeStatusBar.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[plugin]})
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
await Promise.all(Array.from({length:20},()=>m.applyDarkHudStatusBar()))
assert.equal(calls.filter(c=>c[0]==='overlay').length,1)
assert.equal(calls.filter(c=>c[0]==='style').length,1,'Sheet transitions must not rewrite unchanged native chrome')
assert.equal(calls.filter(c=>c[0]==='background').length,0)
blockNextStyle=true
const intoTools=m.applyLightAudioStatusBar()
await new Promise(r=>setImmediate(r))
const backToCamera=m.applyDarkHudStatusBar()
releaseStyle()
await Promise.all([intoTools,backToCamera])
assert.deepEqual(calls.at(-1),['style',{style:'dark'}],'Rapid round trips must settle on the current mode')
failNextStyle=true
await m.applyLightAudioStatusBar()
await m.applyLightAudioStatusBar()
assert.deepEqual(calls.at(-1),['style',{style:'light'}],'An interrupted native update remains retryable')
assert.equal(calls.filter(c=>c[0]==='overlay').length,1)
console.log('PASS: 20 overlapping sheet requests coalesce; rapid Tools/Camera changes settle correctly; native failure retries without repeated WebView layout changes.')
