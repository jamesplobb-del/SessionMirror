import { useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  PITCH_CLARITY_MIN,
  PITCH_FRAME_SIZE,
  PITCH_HOLD_MS,
  PITCH_MIN_VOLUME_DB,
} from '../utils/pitchConfig'
import {
  frequencyToPitchReadout,
  isFrequencyInInstrumentRange,
  normalizeInstrumentFrequency,
  smoothFrequency,
  stabilizePitchReadout,
  type PitchReadout,
} from '../utils/pitchUtils'

interface PitchGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  detector: PitchDetector<Float32Array>
  buffer: Float32Array
  smoothed: number | null
  media: HTMLMediaElement
}

const elementGraphs = new WeakMap<HTMLMediaElement, PitchGraph>()

async function createPitchGraph(media: HTMLMediaElement): Promise<PitchGraph> {
  const existing = elementGraphs.get(media)
  if (existing && existing.context.state !== 'closed') {
    return existing
  }

  if (existing) {
    elementGraphs.delete(media)
  }

  const context = new AudioContext()
  await context.resume()

  let source: MediaElementAudioSourceNode
  try {
    source = context.createMediaElementSource(media)
  } catch {
    await context.close()
    throw new Error('Unable to attach pitch tracker to this playback source')
  }
  const analyser = context.createAnalyser()
  analyser.fftSize = PITCH_FRAME_SIZE

  source.connect(analyser)
  analyser.connect(context.destination)

  const detector = PitchDetector.forFloat32Array(PITCH_FRAME_SIZE)
  detector.clarityThreshold = PITCH_CLARITY_MIN
  detector.minVolumeDecibels = PITCH_MIN_VOLUME_DB

  const graph: PitchGraph = {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(PITCH_FRAME_SIZE),
    smoothed: null,
    media,
  }

  elementGraphs.set(media, graph)
  return graph
}

function disposePitchGraph(graph: PitchGraph | null): void {
  if (!graph) return

  elementGraphs.delete(graph.media)
  graph.source.disconnect()
  graph.analyser.disconnect()
  void graph.context.close()
}

export function useLivePitchTracker(
  mediaRef: RefObject<HTMLMediaElement | null>,
  enabled: boolean,
  isPlaying: boolean,
  mediaKey: string,
): PitchReadout {
  const emptyReadout = frequencyToPitchReadout(0)
  const [readout, setReadout] = useState<PitchReadout>(emptyReadout)
  const graphRef = useRef<PitchGraph | null>(null)
  const rafRef = useRef<number | null>(null)
  const readoutRef = useRef<PitchReadout>(emptyReadout)
  const lastPitchAtRef = useRef(0)

  useEffect(() => {
    readoutRef.current = readout
  }, [readout])

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      disposePitchGraph(graphRef.current)
      graphRef.current = null
      readoutRef.current = emptyReadout
      setReadout(emptyReadout)
      return
    }

    let cancelled = false
    const media = mediaRef.current
    if (!media) return

    void createPitchGraph(media).then((graph) => {
      if (cancelled) {
        disposePitchGraph(graph)
        return
      }
      graphRef.current = graph
    }).catch(() => {
      if (!cancelled) {
        readoutRef.current = emptyReadout
        setReadout(emptyReadout)
      }
    })

    return () => {
      cancelled = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      disposePitchGraph(graphRef.current)
      graphRef.current = null
    }
  }, [enabled, mediaKey, mediaRef])

  useEffect(() => {
    if (!enabled || !isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (!isPlaying) {
        if (graphRef.current) graphRef.current.smoothed = null
        readoutRef.current = emptyReadout
        setReadout(emptyReadout)
        lastPitchAtRef.current = 0
      }
      return
    }

    const tick = () => {
      const graph = graphRef.current
      if (graph) {
        if (graph.context.state === 'suspended') {
          void graph.context.resume()
        }

        graph.analyser.getFloatTimeDomainData(graph.buffer)
        const [rawPitch, clarity] = graph.detector.findPitch(
          graph.buffer,
          graph.context.sampleRate,
        )

        const pitch = normalizeInstrumentFrequency(rawPitch)
        const now = performance.now()

        if (clarity >= PITCH_CLARITY_MIN && isFrequencyInInstrumentRange(pitch)) {
          graph.smoothed = smoothFrequency(graph.smoothed, pitch)
          const next = stabilizePitchReadout(
            readoutRef.current.noteName === '—' ? null : readoutRef.current,
            frequencyToPitchReadout(graph.smoothed),
          )
          readoutRef.current = next
          setReadout(next)
          lastPitchAtRef.current = now
        } else if (
          lastPitchAtRef.current > 0 &&
          now - lastPitchAtRef.current > PITCH_HOLD_MS
        ) {
          readoutRef.current = emptyReadout
          setReadout(emptyReadout)
          graph.smoothed = null
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [enabled, isPlaying, mediaKey])

  return readout
}
