import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'
import { isNativeCameraTestAvailable } from '../utils/nativeCameraTest'
import { subscribeNativeAudioPitchFrames } from '../utils/nativeAudioPitchTap'
import { readAnalyserMetrics } from '../utils/audioLevel'

const LIVE_WAVEFORM_BAR_COUNT = 48
const LIVE_WAVEFORM_INTERVAL_MS = 48
const MIN_VISIBLE_PEAK = 0.035

function createSilentHistory(): number[] {
  return Array.from({ length: LIVE_WAVEFORM_BAR_COUNT }, () => MIN_VISIBLE_PEAK)
}

function measureSamples(samples: Float32Array): { rms: number; peak: number } {
  let sum = 0
  let peak = 0

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    const absolute = Math.abs(sample)
    if (absolute > peak) peak = absolute
    sum += sample * sample
  }

  return {
    rms: samples.length > 0 ? Math.sqrt(sum / samples.length) : 0,
    peak,
  }
}

/**
 * Maps capture amplitude onto a readable Voice Memos-style display. The
 * decibel curve keeps quiet input near the baseline while leaving headroom
 * for normal speech, singing, and sharp instrument attacks.
 */
function normalizeInputLevel(rms: number, peak: number): number {
  const combined = Math.max(rms, peak * 0.35)
  const decibels = 20 * Math.log10(Math.max(combined, 1e-6))
  const normalized = Math.max(0, Math.min(1, (decibels + 52) / 40))
  return Math.pow(normalized, 0.72)
}

interface UseLiveRecordingWaveformOptions {
  active: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
}

/**
 * Builds a rolling waveform from the microphone already owned by the
 * recording session. iOS consumes the existing native PCM bridge; web builds
 * a read-only analyser from the existing MediaStream and never opens another
 * microphone.
 */
export function useLiveRecordingWaveform({
  active,
  streamRef,
  streamGeneration,
}: UseLiveRecordingWaveformOptions): number[] {
  const [history, setHistory] = useState(createSilentHistory)
  const historyRef = useRef(history)
  const envelopeRef = useRef(0)

  useEffect(() => {
    const resetHistory = createSilentHistory()
    historyRef.current = resetHistory
    envelopeRef.current = 0
    setHistory(resetHistory)

    if (!active) return

    let cancelled = false
    let audioContext: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let sampleBuffer: Float32Array | null = null
    let pollTimer: number | null = null
    let nativeListener: PluginListenerHandle | null = null

    const appendMetrics = (rms: number, peak: number) => {
      if (cancelled) return

      const target = normalizeInputLevel(rms, peak)
      const previous = envelopeRef.current
      const response = target >= previous ? 0.72 : 0.3
      const envelope = previous + (target - previous) * response
      envelopeRef.current = envelope

      const next = [
        ...historyRef.current.slice(1),
        Math.max(MIN_VISIBLE_PEAK, envelope),
      ]
      historyRef.current = next
      setHistory(next)
    }

    if (isNativeCameraTestAvailable()) {
      const listenerPromise = subscribeNativeAudioPitchFrames((chunk) => {
        const metrics = measureSamples(chunk.samples)
        appendMetrics(metrics.rms, metrics.peak)
      })

      void listenerPromise
        ?.then((listener) => {
          if (cancelled) {
            void listener.remove()
            return
          }
          nativeListener = listener
        })
        .catch((error) => {
          console.warn('[AudioWaveform] native PCM listener failed', error)
        })
    } else {
      const setupWebAnalyser = async () => {
        const stream = streamRef.current
        const hasLiveAudio = stream
          ?.getAudioTracks()
          .some((track) => track.readyState === 'live' && track.enabled && !track.muted)
        if (!stream || !hasLiveAudio) return

        const AudioContextConstructor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextConstructor) return

        const context = new AudioContextConstructor({ latencyHint: 'interactive' })
        if (context.state === 'suspended') {
          await context.resume().catch(() => {})
        }
        if (cancelled) {
          void context.close().catch(() => {})
          return
        }

        const nextAnalyser = context.createAnalyser()
        nextAnalyser.fftSize = 256
        nextAnalyser.smoothingTimeConstant = 0.16
        const nextSource = context.createMediaStreamSource(stream)
        nextSource.connect(nextAnalyser)

        audioContext = context
        analyser = nextAnalyser
        source = nextSource
        sampleBuffer = new Float32Array(nextAnalyser.fftSize)

        pollTimer = window.setInterval(() => {
          if (!analyser || !sampleBuffer) return
          if (audioContext?.state === 'suspended') {
            void audioContext.resume().catch(() => {})
          }
          const metrics = readAnalyserMetrics(analyser, sampleBuffer)
          appendMetrics(metrics.rms, metrics.peak)
        }, LIVE_WAVEFORM_INTERVAL_MS)
      }

      void setupWebAnalyser().catch((error) => {
        console.warn('[AudioWaveform] Web Audio analyser failed', error)
      })
    }

    return () => {
      cancelled = true
      if (pollTimer !== null) {
        window.clearInterval(pollTimer)
      }
      try {
        source?.disconnect()
        analyser?.disconnect()
      } catch {
        /* graph may already be disconnected during a capture handoff */
      }
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => {})
      }
      if (nativeListener) {
        void nativeListener.remove()
      }
    }
  }, [active, streamGeneration, streamRef])

  return history
}

