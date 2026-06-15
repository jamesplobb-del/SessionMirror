import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMusicRecordingAudioConstraints,
  tuneMusicRecordingStream,
} from '../../utils/audioCapture'
import { createMediaRecorder, getAudioRecorderMimeType } from '../../utils/mobileVideo'

export const STUDIO_TRACK_COUNT = 4
export const STUDIO_LOOKAHEAD_SEC = 0.1

export interface StudioTrack {
  id: string
  audioBuffer: AudioBuffer | null
  isMuted: boolean
  isSolo: boolean
  volume: number
  trimStart: number
  trimEnd: number
}

interface ActiveNodePair {
  source: AudioBufferSourceNode
  gain: GainNode
}

function createInitialTracks(): StudioTrack[] {
  return Array.from({ length: STUDIO_TRACK_COUNT }, (_, index) => ({
    id: `track-${index + 1}`,
    audioBuffer: null,
    isMuted: false,
    isSolo: false,
    volume: 1,
    trimStart: 0,
    trimEnd: 0,
  }))
}

let sharedAudioContext: AudioContext | null = null

function createStudioAudioContext(): AudioContext {
  const WebkitAudioContext = (
    window as Window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext
  const Ctor = window.AudioContext ?? WebkitAudioContext
  if (!Ctor) {
    throw new Error('Web Audio API is not available')
  }
  return new Ctor({ latencyHint: 'interactive' })
}

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = createStudioAudioContext()
  }
  return sharedAudioContext
}

async function resumeSharedContext(): Promise<AudioContext> {
  const context = getSharedAudioContext()
  if (context.state === 'suspended') {
    await context.resume()
  }
  return context
}

async function decodeBlob(context: AudioContext, blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return context.decodeAudioData(arrayBuffer.slice(0))
}

export function getTrackDuration(track: StudioTrack): number {
  return track.audioBuffer?.duration ?? 0
}

export function getEffectiveTrimEnd(track: StudioTrack): number {
  const duration = getTrackDuration(track)
  if (duration <= 0) return 0
  if (track.trimEnd <= 0 || track.trimEnd > duration) return duration
  return track.trimEnd
}

export function getTrimPlayDuration(track: StudioTrack): number {
  const end = getEffectiveTrimEnd(track)
  return Math.max(0, end - track.trimStart)
}

function getPlayableTracks(
  tracks: StudioTrack[],
  excludeTrackId?: string,
): StudioTrack[] {
  const withAudio = tracks.filter(
    (track) => track.audioBuffer && getTrimPlayDuration(track) > 0 && track.id !== excludeTrackId,
  )
  if (withAudio.length === 0) return []

  const soloed = withAudio.filter((track) => track.isSolo)
  if (soloed.length > 0) return soloed

  return withAudio.filter((track) => !track.isMuted)
}

function connectTrackSource(
  context: AudioContext,
  track: StudioTrack,
  when: number,
  onEnded: () => void,
): ActiveNodePair | null {
  if (!track.audioBuffer) return null

  const offset = track.trimStart
  const duration = getTrimPlayDuration(track)
  if (duration <= 0) return null

  const source = context.createBufferSource()
  source.buffer = track.audioBuffer

  const gain = context.createGain()
  gain.gain.value = track.volume

  source.connect(gain)
  gain.connect(context.destination)
  source.onended = onEnded
  source.start(when, offset, duration)

  return { source, gain }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const frameCount = buffer.length
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = frameCount * blockAlign
  const headerSize = 44
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(buffer.getChannelData(channel))
  }

  let offset = headerSize
  for (let index = 0; index < frameCount; index += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][index] ?? 0))
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      )
      offset += bytesPerSample
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

async function sliceBufferRegion(
  buffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
): Promise<AudioBuffer> {
  const sampleRate = buffer.sampleRate
  const startSample = Math.floor(trimStart * sampleRate)
  const endSample = Math.floor(trimEnd * sampleRate)
  const length = Math.max(0, endSample - startSample)

  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    length,
    sampleRate,
  )

  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0, trimStart, trimEnd - trimStart)

  return offline.startRendering()
}

export function useMultiTrackAudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(createInitialTracks)
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMixingDown, setIsMixingDown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  const activeNodesRef = useRef<ActiveNodePair[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const monitorStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordingTrackIdRef = useRef<string | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const disposeActiveNodes = useCallback(() => {
    for (const node of activeNodesRef.current) {
      try {
        node.source.onended = null
        node.source.stop()
      } catch {
        /* already stopped */
      }
      try {
        node.source.disconnect()
        node.gain.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    activeNodesRef.current = []
  }, [])

  const stopPlayback = useCallback(() => {
    disposeActiveNodes()
    setIsPlaying(false)
  }, [disposeActiveNodes])

  const releaseRecordStream = useCallback(() => {
    const stream = recordStreamRef.current
    if (!stream) return
    for (const track of stream.getTracks()) {
      track.stop()
    }
    recordStreamRef.current = null
  }, [])

  const scheduleTracksAtTime = useCallback(
    (
      context: AudioContext,
      playableTracks: StudioTrack[],
      startTime: number,
      onAllEnded?: () => void,
    ) => {
      disposeActiveNodes()

      if (playableTracks.length === 0) {
        onAllEnded?.()
        return
      }

      let remaining = playableTracks.length
      const handleEnded = () => {
        remaining -= 1
        if (remaining <= 0) {
          disposeActiveNodes()
          onAllEnded?.()
        }
      }

      for (const track of playableTracks) {
        const nodes = connectTrackSource(context, track, startTime, handleEnded)
        if (nodes) {
          activeNodesRef.current.push(nodes)
        } else {
          remaining -= 1
        }
      }

      if (remaining <= 0) {
        onAllEnded?.()
      }
    },
    [disposeActiveNodes],
  )

  const primeStudioAudio = useCallback(async () => {
    setError(null)
    await resumeSharedContext()

    if (monitorStreamRef.current?.active) {
      return monitorStreamRef.current
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getMusicRecordingAudioConstraints(),
      video: false,
    })
    await tuneMusicRecordingStream(stream)
    monitorStreamRef.current = stream
    return stream
  }, [])

  const playAll = useCallback(async () => {
    if (recordingTrackIdRef.current) return

    const playable = getPlayableTracks(tracksRef.current)
    if (playable.length === 0) return

    setError(null)
    stopPlayback()

    try {
      const context = await resumeSharedContext()
      const scheduleAt = context.currentTime + STUDIO_LOOKAHEAD_SEC
      setIsPlaying(true)

      scheduleTracksAtTime(context, playable, scheduleAt, () => {
        setIsPlaying(false)
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Playback failed')
      setIsPlaying(false)
    }
  }, [scheduleTracksAtTime, stopPlayback])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      recordingTrackIdRef.current = null
      setRecordingTrackId(null)
      return
    }

    recorder.stop()
  }, [])

  const startRecording = useCallback(
    async (trackId: string) => {
      if (recordingTrackIdRef.current) return

      setError(null)
      stopPlayback()

      try {
        const context = await resumeSharedContext()
        const scheduleAt = context.currentTime + STUDIO_LOOKAHEAD_SEC
        const backingTracks = getPlayableTracks(tracksRef.current, trackId)

        scheduleTracksAtTime(context, backingTracks, scheduleAt)

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: getMusicRecordingAudioConstraints(),
          video: false,
        })
        await tuneMusicRecordingStream(micStream)

        recordStreamRef.current = micStream
        monitorStreamRef.current = micStream

        const mimeType = getAudioRecorderMimeType()
        const recorder = createMediaRecorder(micStream, mimeType)
        recordChunksRef.current = []

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordChunksRef.current.push(event.data)
          }
        }

        recorder.onstop = () => {
          const chunks = recordChunksRef.current
          const stoppedTrackId = recordingTrackIdRef.current
          recordingTrackIdRef.current = null
          setRecordingTrackId(null)
          recorderRef.current = null
          releaseRecordStream()
          disposeActiveNodes()

          if (!stoppedTrackId || chunks.length === 0) return

          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType,
          })

          void decodeBlob(context, blob).then((audioBuffer) => {
            setTracks((current) =>
              current.map((track) =>
                track.id === stoppedTrackId
                  ? {
                      ...track,
                      audioBuffer,
                      trimStart: 0,
                      trimEnd: audioBuffer.duration,
                      isMuted: false,
                    }
                  : track,
              ),
            )
          }).catch(() => {
            setError('Unable to decode recorded track')
          })
        }

        recorder.onerror = () => {
          setError('Recording failed')
          recordingTrackIdRef.current = null
          setRecordingTrackId(null)
          recorderRef.current = null
          releaseRecordStream()
          disposeActiveNodes()
        }

        recorderRef.current = recorder
        recordingTrackIdRef.current = trackId
        setRecordingTrackId(trackId)
        recorder.start()
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Unable to start recording',
        )
        recordingTrackIdRef.current = null
        setRecordingTrackId(null)
        recorderRef.current = null
        releaseRecordStream()
        disposeActiveNodes()
      }
    },
    [
      disposeActiveNodes,
      releaseRecordStream,
      scheduleTracksAtTime,
      stopPlayback,
    ],
  )

  const toggleMute = useCallback((trackId: string) => {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, isMuted: !track.isMuted } : track,
      ),
    )
  }, [])

  const toggleSolo = useCallback((trackId: string) => {
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, isSolo: !track.isSolo } : track,
      ),
    )
  }, [])

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, volume: clamped } : track,
      ),
    )
  }, [])

  const setTrackTrim = useCallback(
    (trackId: string, trimStart: number, trimEnd: number) => {
      setTracks((current) =>
        current.map((track) => {
          if (track.id !== trackId) return track
          const duration = getTrackDuration(track)
          const start = Math.max(0, Math.min(trimStart, duration))
          const end = Math.max(start, Math.min(trimEnd, duration))
          return { ...track, trimStart: start, trimEnd: end }
        }),
      )
    },
    [],
  )

  const clearTrack = useCallback(
    (trackId: string) => {
      if (recordingTrackIdRef.current === trackId) {
        stopRecording()
      }
      if (isPlayingRef.current) {
        stopPlayback()
      }

      setTracks((current) =>
        current.map((track) =>
          track.id === trackId
            ? {
                ...track,
                audioBuffer: null,
                isMuted: false,
                isSolo: false,
                volume: 1,
                trimStart: 0,
                trimEnd: 0,
              }
            : track,
        ),
      )
    },
    [stopPlayback, stopRecording],
  )

  const mixdown = useCallback(async (): Promise<{
    blob: Blob
    durationSeconds: number
  } | null> => {
    if (recordingTrackIdRef.current) return null

    const playable = getPlayableTracks(tracksRef.current)
    if (playable.length === 0) return null

    setIsMixingDown(true)
    setError(null)
    stopPlayback()

    try {
      const context = await resumeSharedContext()
      const sampleRate = context.sampleRate

      const trimmed = await Promise.all(
        playable.map(async (track) => {
          const end = getEffectiveTrimEnd(track)
          const sliced = await sliceBufferRegion(
            track.audioBuffer!,
            track.trimStart,
            end,
          )
          return { track, buffer: sliced }
        }),
      )

      const length = Math.max(...trimmed.map(({ buffer }) => buffer.length))
      const channels = Math.max(...trimmed.map(({ buffer }) => buffer.numberOfChannels))
      const offline = new OfflineAudioContext(channels, length, sampleRate)

      for (const { track, buffer } of trimmed) {
        const source = offline.createBufferSource()
        source.buffer = buffer
        const gain = offline.createGain()
        gain.gain.value = track.volume
        source.connect(gain)
        gain.connect(offline.destination)
        source.start(0)
      }

      const rendered = await offline.startRendering()
      const blob = audioBufferToWav(rendered)

      return {
        blob,
        durationSeconds: rendered.duration,
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mixdown failed')
      return null
    } finally {
      setIsMixingDown(false)
    }
  }, [stopPlayback])

  const shutdown = useCallback(() => {
    disposeActiveNodes()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null
    releaseRecordStream()

    const monitor = monitorStreamRef.current
    if (monitor) {
      for (const track of monitor.getTracks()) {
        track.stop()
      }
    }
    monitorStreamRef.current = null

    if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
      void sharedAudioContext.close()
    }
    sharedAudioContext = null
  }, [disposeActiveNodes, releaseRecordStream])

  useEffect(() => shutdown, [shutdown])

  return {
    tracks,
    recordingTrackId,
    isPlaying,
    isMixingDown,
    error,
    micStreamRef: monitorStreamRef,
    primeStudioAudio,
    startRecording,
    stopRecording,
    playAll,
    stopPlayback,
    toggleMute,
    toggleSolo,
    setTrackVolume,
    setTrackTrim,
    clearTrack,
    mixdown,
    shutdown,
  }
}

/** Tear down studio audio resources when leaving Studio Mode. */
export function shutdownStudioAudioContext(): void {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    void sharedAudioContext.close()
  }
  sharedAudioContext = null
}
