import { FAKE_MEDIA, installFakeMediaDevices } from '../../src/utils/fakeMediaDevices'

const result = document.querySelector<HTMLPreElement>('#result')!
const player = document.querySelector<HTMLVideoElement>('#player')!
const capture = document.querySelector<HTMLButtonElement>('#capture')!
let url = ''
function report(value: unknown) { result.textContent = JSON.stringify(value, null, 2) }
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('besttake-practice-qa-media', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('samples')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function reopen() {
  const db = await database()
  const blob = await new Promise<Blob>((resolve, reject) => {
    const request = db.transaction('samples').objectStore('samples').get('baseline')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  if (!blob) throw new Error('No saved sample. Generate one first.')
  if (url) URL.revokeObjectURL(url)
  url = URL.createObjectURL(blob)
  player.src = url
  await new Promise<void>((resolve, reject) => {
    player.onloadeddata = () => resolve()
    player.onerror = () => reject(new Error('Saved sample did not decode'))
  })
  report({ stage: 'reopened-and-decoded', bytes: blob.size, mime: blob.type,
    videoWidth: player.videoWidth, videoHeight: player.videoHeight, readyState: player.readyState })
}
capture.onclick = async () => {
  capture.disabled = true
  let stream: MediaStream | undefined
  try {
    if (!FAKE_MEDIA) throw new Error('Requires the dedicated QA Vite config; refusing real hardware.')
    installFakeMediaDevices()
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } })
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = event => reject(event)
    })
    recorder.start(250)
    report({ stage: 'recording', tracks: stream.getTracks().map(t => ({ kind: t.kind, state: t.readyState })) })
    setTimeout(() => recorder.stop(), 3000)
    await stopped
    const blob = new Blob(chunks, { type: recorder.mimeType })
    if (!blob.size) throw new Error('Recorder produced an empty file')
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('samples', 'readwrite')
      transaction.objectStore('samples').put(blob, 'baseline')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
    await reopen()
  } catch (error) { report({ stage: 'failed', error: String(error) }) }
  finally { stream?.getTracks().forEach(track => track.stop()); capture.disabled = false }
}
document.querySelector<HTMLButtonElement>('#reopen')!.onclick = () => { void reopen().catch(error => report({ stage: 'failed', error: String(error) })) }
document.querySelector<HTMLButtonElement>('#validate')!.onclick = async () => {
  const context = new AudioContext()
  try {
    if (!url) throw new Error('Reopen a sample first')
    const bytes = await (await fetch(url)).arrayBuffer()
    const buffer = await context.decodeAudioData(bytes)
    const samples = buffer.getChannelData(0)
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    player.currentTime = 0
    await player.play()
    await new Promise(resolve => setTimeout(resolve, 700))
    const progress = player.currentTime
    player.pause()
    if (rms < 0.001 || progress < 0.2) throw new Error(`Playback baseline failed: RMS=${rms}, time=${progress}`)
    report({ stage: 'playback-and-audio-verified', audioDuration: buffer.duration,
      channels: buffer.numberOfChannels, rms, playbackTime: progress,
      decodedVideoFrames: player.getVideoPlaybackQuality().totalVideoFrames })
  } catch (error) { report({ stage: 'failed', error: String(error) }) }
  finally { await context.close() }
}
