import { createTake } from './takes'
import { BOT_QA_MODE, BOT_QA_TAKE_ID_PREFIX } from './botQaMode'
import type { Take } from '../types'

interface QaClipSpec {
  index: number
  name: string
  color: string
}

const QA_CLIPS: QaClipSpec[] = [
  { index: 1, name: 'QA Melody', color: '#0f766e' },
  { index: 2, name: 'QA Harmony', color: '#1d4ed8' },
  { index: 3, name: 'QA Bass', color: '#9a3412' },
]

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}

async function probeVideoDuration(blob: Blob): Promise<number> {
  if (typeof document === 'undefined') return 0
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(blob)
    const finish = (duration: number) => {
      URL.revokeObjectURL(url)
      video.src = ''
      resolve(duration)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = video.duration
      finish(Number.isFinite(duration) && duration > 0 ? duration : 0)
    }
    video.onerror = () => finish(0)
    window.setTimeout(() => finish(0), 2500)
    video.src = url
  })
}

/**
 * A short labeled clip the take picker will accept (it only lists video).
 * Playback is a stand-in so Mix / Play all / layout have something to drive.
 */
async function recordLabeledClip(spec: QaClipSpec): Promise<{
  blob: Blob
  mimeType: string
  thumbnailUrl: string
  duration: number
} | null> {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null
  if (typeof MediaRecorder === 'undefined') return null

  const width = 360
  const height = 640
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.position = 'fixed'
  canvas.style.left = '-9999px'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx || typeof canvas.captureStream !== 'function') {
    canvas.remove()
    return null
  }

  const draw = (elapsedMs: number) => {
    ctx.fillStyle = spec.color
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = '600 36px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(spec.name, width / 2, height / 2)
    ctx.font = '500 18px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Bot QA take', width / 2, height / 2 + 40)
    ctx.fillText(`${(elapsedMs / 1000).toFixed(1)}s`, width / 2, height / 2 + 72)
  }

  draw(0)
  const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7)
  const videoStream = canvas.captureStream(15)
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()]

  let audioContext: AudioContext | null = null
  let oscillator: OscillatorNode | null = null
  try {
    audioContext = new AudioContext()
    oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    gain.gain.value = 0.08
    oscillator.frequency.value = 220 * spec.index
    oscillator.connect(gain)
    const dest = audioContext.createMediaStreamDestination()
    gain.connect(dest)
    oscillator.start()
    tracks.push(...dest.stream.getAudioTracks())
  } catch {
    audioContext = null
    oscillator = null
  }

  const stream = new MediaStream(tracks)
  const mimeType = pickRecorderMime()
  let recorder: MediaRecorder
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    oscillator?.stop()
    void audioContext?.close()
    canvas.remove()
    return null
  }

  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })

  const stopped = new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true })
  })

  recorder.start(200)
  const startedAt = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startedAt
      draw(elapsed)
      if (elapsed >= 2000) {
        resolve()
        return
      }
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  })
  if (recorder.state === 'recording') recorder.stop()
  await stopped
  oscillator?.stop()
  void audioContext?.close()
  stream.getTracks().forEach((track) => track.stop())
  canvas.remove()

  if (chunks.length === 0) return null
  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
  if (blob.size < 32) return null
  const duration = await probeVideoDuration(blob)
  return {
    blob,
    mimeType: blob.type || 'video/webm',
    thumbnailUrl,
    duration: duration > 0 ? duration : 2,
  }
}

export async function createBotQaTakes(): Promise<Take[]> {
  if (!BOT_QA_MODE) return []

  const takes: Take[] = []
  for (const spec of QA_CLIPS) {
    const clip = await recordLabeledClip(spec)
    if (!clip) continue
    const id = `${BOT_QA_TAKE_ID_PREFIX}${spec.index}`
    const take = createTake(id, spec.index, URL.createObjectURL(clip.blob), '', clip.mimeType, 'video')
    take.name = spec.name
    take.duration = clip.duration
    take.thumbnailUrl = clip.thumbnailUrl
    take.notes = 'Seeded for Grok Bot QA. Not a real performance.'
    takes.push(take)
  }

  return takes
}
