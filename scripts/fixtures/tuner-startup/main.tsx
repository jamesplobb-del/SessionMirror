// Development-only browser fixture. Uses the actual Capacitor proxy, tuner tab,
// tracker, and renderer. Only iOS hardware/transport is simulated.
import React, { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import objc from '../../../ios/App/App/BestTakeAudioPlugin.m?raw'
import swift from '../../../ios/App/App/BestTakeAudioPlugin.swift?raw'
import '../../../src/index.css'
import '../../../src/styles/practice-system.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/midnight-electric.css'
import '../../../src/styles/reactive-silk-tuner.css'
import './fixture.css'

const params = new URLSearchParams(location.search)
const legacy = params.has('legacy')
const sharedCapture = params.has('shared')
const hasCategory = /CAP_PLUGIN\(BestTakeAudioPlugin/.test(objc)
const methodNames = hasCategory
  ? [...objc.matchAll(/CAP_PLUGIN_METHOD\((\w+),/g)].map(match => match[1])
  : [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map(match => match[1])
const methods = methodNames.filter(name => !legacy || name !== 'setNativeTunerPitchEnabled')
const calls: Record<string, number> = {}
const errors: string[] = []
let monitor = false
let delivering = false
let frequency = 440
let phrase = false
let frames = 0
let webMicRequests = 0
let timer: number | undefined
const webAudioTracks = new Set<MediaStreamTrack>()
let mockAudio: AudioContext | undefined
let sourceAudio: MediaStreamAudioDestinationNode | undefined
const globals = window as any
function emit() {
  if (!monitor || !delivering) return
  frames++
  if (phrase) {
    const seconds = performance.now() / 1000
    const note = [220, 293.665, 440, 493.883, 0][Math.floor(seconds / 3) % 5]
    frequency = note * 2 ** ((24 * Math.sin(seconds * 2.3)) / 1200)
  }
  window.dispatchEvent(new CustomEvent('besttake:native-tuner-pitch', {
    detail: { frequency, confidence: frequency ? 0.99 : 0, rmsDb: frequency ? -22 : -160 },
  }))
}
globals.CapacitorCustomPlatform = { name: 'ios' }
globals.Capacitor = {
  PluginHeaders: [{ name: 'BestTakeAudioPlugin', methods: [
    ...methods.map(name => ({ name, rtype: 'promise' })),
    { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' },
  ] }],
  nativePromise: async (_plugin: string, method: string, options: any = {}) => {
    calls[method] = (calls[method] || 0) + 1
    await new Promise(resolve => setTimeout(resolve, 25))
    if (method === 'startNativeTunerMonitor') { monitor = true; return { active: true } }
    if (method === 'getRuntimeEnvironment') return { isSimulator: false }
    if (method === 'stopNativeTunerMonitor') { monitor = false; return { active: false } }
    if (method === 'setNativeTunerPitchEnabled') {
      delivering = options.enabled
      clearInterval(timer)
      // Match a 2048-sample native hop at 48kHz; canvas drawing is capped separately.
      if (delivering) timer = window.setInterval(emit, 43)
      return
    }
    if (['setDeviceMicForRecording', 'setCameraSessionState', 'removeListener', 'setNativeCameraPassthrough', 'stopNativeCameraBridge'].includes(method)) return {}
    throw new Error(`Fixture has no hardware handler for ${method}`)
  },
  nativeCallback: () => 'fixture-listener',
}
navigator.mediaDevices.getUserMedia = async (constraints) => {
  webMicRequests++
  if (sharedCapture) {
    mockAudio ??= new AudioContext()
    sourceAudio ??= mockAudio.createMediaStreamDestination()
    const stream = new MediaStream()
    if (constraints?.audio) {
      const track = sourceAudio.stream.getAudioTracks()[0].clone()
      stream.addTrack(track)
      webAudioTracks.add(track)
    }
    return stream
  }
  throw new DOMException('Native capture owns the microphone in this fixture', 'NotAllowedError')
}
const originalWarn = console.warn
console.warn = (...args) => { errors.push(args.map(String).join(' ')); if (errors.length > 20) errors.shift(); originalWarn(...args) }
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const { ActionSheetProvider } = await import('../../../src/context/ActionSheetContext')
const { default: AudioTunerTab } = await import('../../../src/components/audioPractice/AudioTunerTab')
const { useCameraSession } = await import('../../../src/hooks/useCameraSession')
const { registerAppForegroundLifecycle } = await import('../../../src/utils/appForeground')
registerAppForegroundLifecycle()
document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.classList.add('app-audio-mode')

function Fixture({ capture }: { capture?: ReturnType<typeof useCameraSession> }) {
  const [active, setActive] = useState(!sharedCapture)
  const [instrument, setInstrument] = useState<'winds' | 'voice' | 'strings'>('winds')
  const stream = useRef<MediaStream | null>(null)
  const [stats, setStats] = useState('')
  React.useEffect(() => {
    const id = setInterval(() => setStats(JSON.stringify({
      registration: hasCategory ? 'Objective-C category' : 'Swift', legacy,
      nativeMethodAvailable: methods.includes('setNativeTunerPitchEnabled'),
      frames, monitor, delivering, webMicRequests, calls, errors,
      liveWebAudioTracks: [...webAudioTracks].filter(track => track.readyState === 'live').length,
      recordReady: capture?.ready,
      elapsedSeconds: Math.round(performance.now() / 1000),
    }, null, 2)), 500)
    return () => clearInterval(id)
  }, [capture?.ready])
  return <>
    <h1>Tuner startup integration check</h1>
    <p>Real tuner UI + Capacitor proxy. Simulated native microphone/results.</p>
    <button onClick={() => setActive(value => !value)}>{active ? 'Leave tuner' : 'Open tuner'}</button>{' '}
    <button onClick={() => { phrase = false; frequency = 493.883 }}>Play B4</button>{' '}
    <button onClick={() => { phrase = false; frequency = 440 }}>Play A4</button>{' '}
    <button onClick={() => { phrase = true }}>Play phrase</button>{' '}
    <button onClick={() => { phrase = false; frequency = 0 }}>Silence</button>{' '}
    <button onClick={() => { document.documentElement.classList.toggle('app-dark-mode') }}>Toggle dark</button>
    {capture && <button onClick={() => capture.requestCameraAccess('audio')}>Retry shared microphone</button>}
    <div className="fixture-screen app-ui-overlay app-ui-overlay--audio-mode app-ui-overlay--audio-practice-tuner">
    {active && <AudioTunerTab active streamRef={capture?.streamRef ?? stream} streamGeneration={capture?.streamGeneration ?? 0}
      nativeLivePreviewActive={false} ready permissionRequestInFlight={false} isRecording={false}
      tunerInstrument={instrument} tunerTransposition="concert" onTunerTranspositionChange={() => {}}
      onTunerInstrumentChange={setInstrument} droneWaveform="sine" hapticFeedback={false}
      micInputPreference="auto" handsFreeEnabled={false}
      onRequestMicStream={async () => { webMicRequests++; return false }} />}
    </div>
    <pre aria-label="Integration diagnostics">{stats}</pre>
  </>
}
function SharedCaptureFixture() {
  const capture = useCameraSession({ onRecordingComplete: () => {}, micInputPreference: 'auto' })
  React.useEffect(() => { capture.changeRecordingMode('audio') }, [capture.changeRecordingMode])
  return <Fixture capture={capture} />
}
createRoot(document.getElementById('root')!).render(<StrictMode><ActionSheetProvider>{sharedCapture ? <SharedCaptureFixture /> : <Fixture />}</ActionSheetProvider></StrictMode>)
