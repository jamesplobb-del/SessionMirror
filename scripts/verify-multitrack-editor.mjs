import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ stdin: { contents: "export * from './src/multitrack/layout/boxGesture'; export * from './src/multitrack/synchronization/editorGeometry'", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' })
const { transformBox, waveformRasterSize, visibleRulerSeconds } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const rect = {xPercent:64,yPercent:64,widthPercent:32,heightPercent:28}
assert.deepEqual(transformBox(rect,'move',-64,-64),{...rect,xPercent:0,yPercent:0})
assert.deepEqual(transformBox(rect,'move',100,100),{...rect,xPercent:68,yPercent:72})
assert.deepEqual(transformBox(rect,'nw',-64,-64),{xPercent:0,yPercent:0,widthPercent:96,heightPercent:92})
assert.deepEqual(transformBox(rect,'se',100,100),{...rect,widthPercent:36,heightPercent:36})
assert.deepEqual(transformBox(rect,'ne',4,-64),{xPercent:64,yPercent:0,widthPercent:36,heightPercent:92})
assert.deepEqual(transformBox(rect,'sw',-64,8),{xPercent:0,yPercent:64,widthPercent:96,heightPercent:36})
for (const mode of ['move','nw','ne','sw','se']) for (let x=-200;x<=200;x+=7) for (let y=-200;y<=200;y+=11) {
 const next=transformBox(rect,mode,x,y)
 assert.ok(next.xPercent>=0&&next.yPercent>=0)
 assert.ok(next.widthPercent>=5&&next.heightPercent>=5)
 assert.ok(next.xPercent+next.widthPercent<=100.00001&&next.yPercent+next.heightPercent<=100.00001)
 if(mode==='move')assert.deepEqual([next.widthPercent,next.heightPercent],[32,28])
}
assert.equal(transformBox(rect,'move',NaN,1),rect)
for(const seconds of [10,60,1200,3600])for(const zoom of [24,40,70,120])for(const dpr of [1,2,3,4]){
 const raster=waveformRasterSize(seconds*zoom,58,dpr)
 assert.ok(raster.width<=2048&&raster.height<=256)
 assert.ok(raster.width*raster.height*4<=2*1024*1024,'Each waveform backing store stays below 2 MiB')
 for(const left of [0,seconds*zoom/2,Math.max(0,seconds*zoom-390)]){
  const ticks=visibleRulerSeconds(seconds,zoom,left,390,96)
  assert.ok(ticks.length<=24,'Ruler DOM scales with viewport, not recording length')
  assert.ok(ticks.every(t=>t>=0&&t<=Math.ceil(seconds)+1))
 }
}
console.log('PASS: free movement, four-corner resizing, edge/minimum bounds, finite coordinates, capped waveform memory, and viewport-bounded ruler ticks.')
