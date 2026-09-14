import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dir = await mkdtemp(join(tmpdir(),'tuner-trace-'))
try {
  const file = join(dir,'trace.mjs')
  await build({ entryPoints:['src/utils/tunerTrace.ts'], outfile:file, bundle:true, platform:'node', format:'esm' })
  const { createTunerTrace, appendTunerTrace, tunerTracePoints } = await import(file)
  const config = join(dir,'config.mjs')
  await build({ entryPoints:['src/utils/pitchConfig.ts'], outfile:config, bundle:true, platform:'node', format:'esm' })
  const { PITCH_SILENCE_FLOOR_CENTS: silence } = await import(config)
  const trace = createTunerTrace()
  for(let t=0;t<=5000;t+=1000/60) appendTunerTrace(trace,t,18*Math.sin(t/130))
  const saved = JSON.stringify(trace.samples)
  const live = tunerTracePoints(trace.samples,4000,400,300)
  const rewound = tunerTracePoints(trace.samples,3800,400,300)
  for(const point of live) {
    const earlier = rewound.find(p=>p.time===point.time)
    if(!earlier) continue
    assert.equal(earlier.y,point.y,'rewind must not reshape any stored pitch')
    assert.equal(earlier.cents,point.cents)
    assert.ok(Math.abs((earlier.x-point.x)-200/1833*360)<1e-8,'rewind translates every point equally')
  }
  assert.equal(JSON.stringify(trace.samples),saved,'drawing never modifies the stored trace')
  const oldPoints = trace.samples.slice().map(p=>({...p}))
  appendTunerTrace(trace,5020,-30)
  assert.deepEqual(trace.samples.slice(0,oldPoints.length),oldPoints,'new notes never reshape old notes')
  for(const fps of [30,60,120]) {
    const stream=createTunerTrace()
    for(let t=0;t<=3000;t+=1000/fps) appendTunerTrace(stream,t,10)
    const points=tunerTracePoints(stream.samples,3000,400,300)
    const a=points[0],b=points.at(-1)
    assert.ok(Math.abs((b.x-a.x)/(b.time-a.time)-360/1833)<1e-8,`${fps}Hz uses the same horizontal scale`)
  }
  const dropout=createTunerTrace()
  appendTunerTrace(dropout,0,10)
  appendTunerTrace(dropout,17,silence)
  appendTunerTrace(dropout,34,silence)
  appendTunerTrace(dropout,50,12)
  assert.ok(dropout.samples.every(p=>p.cents!==silence),'brief dropout must not blink the line or dot')
  appendTunerTrace(dropout,140,silence)
  assert.equal(dropout.samples.at(-1).cents,silence,'real silence must remain a break')
  appendTunerTrace(dropout,1000,20)
  assert.equal(dropout.samples.at(-2).cents,silence,'background interruption is a gap')
  const long=createTunerTrace()
  for(let t=0;t<180000;t+=1000/120) appendTunerTrace(long,t,5)
  assert.ok(long.samples.length<15000,'two minute history stays bounded')
  assert.ok(long.samples[0].time>58000)
  console.log('PASS: unchanged rewind geometry, immutable history, 30/60/120Hz time scale, dropout hold, real rests, suspension gaps, bounded history.')
} finally { await rm(dir,{recursive:true,force:true}) }
