import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
const temp = await mkdtemp(join(tmpdir(), 'practice-sounds-'))
const output = process.argv[2] ? resolve(process.argv[2]) : null
const sounds = ['classic','woodblock','soft','electronic']
const tiers = ['downbeat','macro','beat','subdivision']
const wav = samples => {
  const data=Buffer.alloc(44+samples.length*2)
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8)
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22)
  data.writeUInt32LE(48000,24);data.writeUInt32LE(96000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34)
  data.write('data',36);data.writeUInt32LE(samples.length*2,40)
  samples.forEach((v,i)=>data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2))
  return data
}
try {
  const { outputFiles } = await build({stdin:{contents:"export * from './src/utils/metronomeClickSounds'; export * from './src/utils/dronePrefs';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})
  const m=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
  const metronome=await readFile('ios/App/App/MetronomeEngine.swift','utf8')
  const drone=await readFile('ios/App/App/DroneEngine.swift','utf8')
  const helpers=metronome.slice(metronome.indexOf('enum MetronomeClickTier'),metronome.indexOf('/// Native metronome'))+'\n'+drone.slice(drone.indexOf('enum DroneWaveform'),drone.indexOf('final class DroneEngine'))
  const swift=`import Foundation\n${helpers}
var output: [String: [Float]] = [:]
for rate in [44100.0,48000.0] {
 for sound in [MetronomeSoundId.classic,.woodblock,.soft,.electronic] {
  for tier in [MetronomeClickTier.downbeat,.macro,.beat,.subdivision] {
   let profile=BestTakeClickSound.profile(for:tier,sound:sound)
   output["\\(Int(rate))-\\(sound.rawValue)-\\(tier.rawValue)"]=(0...Int(ceil(Double(profile.decaySec)*rate))).map { BestTakeClickSound.sample(time:Double($0)/rate,profile:profile) }
  }
 }
 for wave in DroneWaveform.allCases {
  for midi in 12...119 {
   let hz: Float=440*pow(2,Float(midi-69)/12)
   let h=droneHarmonics(waveform:wave,frequency:hz,sampleRate:Float(rate))
   var total: Float=0
   for i in 0..<8 {
    total += abs(h[i])
    if hz*Float(i+1) >= Float(rate)*0.48 { precondition(h[i]==0,"Aliasing partial") }
   }
   precondition(total <= 1.000001 && h[0] > 0,"Fundamental/headroom")
   for i in 0..<256 { precondition(abs(droneWaveSample(phase:Double(i)*2 * .pi/256,harmonics:h))<=1.000001) }
  }
 }
}
for wave in DroneWaveform.allCases {
 let h=droneHarmonics(waveform:wave,frequency:220,sampleRate:48000)
 output["drone-\\(wave.rawValue)"]=(0..<144000).map { i in
  let fade=min(1,min(Double(i)/2400,Double(143999-i)/4800))
  return droneWaveSample(phase:Double(i)*2 * .pi*220/48000,harmonics:h)*0.82*Float(0.5-0.5*cos(.pi*fade))
 }
}
let json=try JSONSerialization.data(withJSONObject:output)
try json.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
`
  await writeFile(join(temp,'main.swift'),swift)
  execFileSync('swiftc',['-O','-module-cache-path',join(temp,'cache'),join(temp,'main.swift'),'-o',join(temp,'render')],{stdio:'pipe'})
  execFileSync(join(temp,'render'),[join(temp,'native.json')],{stdio:'pipe'})
  const rendered=JSON.parse(await readFile(join(temp,'native.json'),'utf8'))
  let maxDifference=0
  for(const rate of [44100,48000]) for(const sound of sounds) {
    let previousRms=Infinity
    for(const tier of tiers) {
      const samples=rendered[`${rate}-${sound}-${tier}`]
      const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length)
      assert.ok(rms<previousRms,`${sound} must preserve accent hierarchy`);previousRms=rms
      assert.equal(samples[0],0);assert.equal(samples.at(-1),0)
      assert.ok(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.85))
      samples.forEach((v,i)=>{maxDifference=Math.max(maxDifference,Math.abs(v-m.metronomeClickSample(i/rate,tier,sound)))})
    }
  }
  assert.ok(maxDifference<.000002,`Web/native mismatch: ${maxDifference}`)
  globalThis.localStorage={getItem:()=>JSON.stringify({waveform:'sine',volume:0,octave:0})}
  const prefs=m.loadDronePrefs();assert.equal(prefs.waveform,'sine');assert.equal(prefs.volume,0);assert.equal(prefs.octave,0)
  delete globalThis.localStorage
  // Scheduling uses the requested time and frees nodes when playback ends.
  let starts=[],disconnected=0,ended
  const context={sampleRate:48000,createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)}),createBufferSource:()=>({connect(){},disconnect(){disconnected++},addEventListener(_,fn){ended=fn},start(t){starts.push(t)}})}
  m.scheduleMetronomeClick(context,12.5,'downbeat',{},false,'classic');assert.deepEqual(starts,[12.5]);ended();assert.equal(disconnected,1)
  m.scheduleMetronomeClick(context,13,'beat',{},true,'classic');assert.equal(starts.length,1)
  if(output) {
    await mkdir(output,{recursive:true})
    let clickDemo=[]
    for(const sound of sounds) {
      for(const tier of ['downbeat','beat','beat','beat','downbeat','subdivision','macro','subdivision']) {
        const beat=Array(24000).fill(0), click=rendered[`48000-${sound}-${tier}`]
        click.forEach((v,i)=>beat[i]=v);clickDemo.push(...beat)
      }
      clickDemo.push(...Array(24000).fill(0))
    }
    await writeFile(join(output,'metronome-clarity-preview.wav'),wav(clickDemo))
    let droneDemo=[]
    for(const wave of ['sine','triangle','organ','warmSynth']) {
      for(const sample of rendered[`drone-${wave}`]) droneDemo.push(sample)
      droneDemo.push(...Array(24000).fill(0))
    }
    await writeFile(join(output,'drone-clarity-preview.wav'),wav(droneDemo))
  }
  console.log(`PASS: 32 native/web click comparisons (max difference ${maxDifference.toExponential(2)}), accent levels, zero endpoints, 864 drone pitch/timbre/rate cases, scheduling, mute, node cleanup, and saved tone settings.`)
} finally {await rm(temp,{recursive:true,force:true})}
