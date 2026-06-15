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
  blob: Blob | null
  isMuted: boolean
  isSolo: boolean
}

function createInitialTracks(): StudioTrack[] {
  return Array.from({ length: STUDIO_TRACK_COUNT }, (_, index) => ({
    id: `track-${index + 1}`,
    blob: null,
    isMuted: false,
    isSolo: false,
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

async function decodeTrackBlob(
  context: AudioContext,
  blob: Blob,
): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  return context.decodeAudioData(arrayBuffer.slice(0))
}

function getPlayableTracks(
  tracks: StudioTrack[],
  excludeTrackId?: string,
): StudioTrack[] {
  const withAudio = tracks.filter(
    (track) => track.blob && track.id !== excludeTrackId,
  )
  if (withAudio.length === 0) return []

  const soloed = withAudio.filter((track) => track.isSolo)
  if (soloed.length > 0) return soloed

  return withAudio.filter((track) => !track.isMuted)
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

export function useMultiTrackAudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(createInitialTracks)
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null)
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [isMixingDown, setIsMixingDown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const monitorStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordingTrackIdRef = useRef<string | null>(null)

  const disposeActiveSources = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.onended = null
        source.stop()
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    activeSourcesRef.current = []
  }, [])

  const stopPlayback = useCallback(() => {
    disposeActiveSources()
    setPlayingTrackId(null)
  }, [disposeActiveSources])

  const releaseRecordStream = useCallback(() => {
    const stream = recordStreamRef.current
    if (!stream) return
    for (const track of stream.getTracks()) {
      track.stop()
    }
    recordStreamRef.current = null
  }, [])

  const scheduleTracksAtTime = useCallback(
    async (
      context: AudioContext,
      playableTracks: StudioTrack[],
      startTime: number,
      onEnded?: () => void,
    ) => {
      disposeActiveSources()

      if (playableTracks.length === 0) {
        onEnded?.()
        return
      }

      const decoded = await Promise.all(
        playableTracks.map(async (track) => ({
          track,
          buffer: await decodeTrackBlob(context, track.blob!),
        })),
      )

      let remaining = decoded.length
      const handleEnded = () => {
        remaining -= 1
        if (remaining <= 0) {
          disposeActiveSources()
          onEnded?.()
        }
      }

      for (const { buffer } of decoded) {
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        source.onended = handleEnded
        source.start(startTime)
        activeSourcesRef.current.push(source)
      }
    },
    [disposeActiveSources],
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

  const playTrack = useCallback(
    async (trackId: string) => {
      if (recordingTrackIdRef.current) return

      const track = tracksRef.current.find((row) => row.id === trackId)
      if (!track?.blob) return

      setError(null)
      stopPlayback()

      try {
        const context = await resumeSharedContext()
        const scheduleAt = context.currentTime + STUDIO_LOOKAHEAD_SEC
        setPlayingTrackId(trackId)

        await scheduleTracksAtTime(context, [track], scheduleAt, () => {
          setPlayingTrackId((current) => (current === trackId ? null : current))
        })
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Unable to play this track',
        )
        setPlayingTrackId(null)
      }
    },
    [scheduleTracksAtTime, stopPlayback],
  )

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

        await scheduleTracksAtTime(context, backingTracks, scheduleAt)

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
          disposeActiveSources()

          if (!stoppedTrackId || chunks.length === 0) return

          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType,
          })

          setTracks((current) =>
            current.map((track) =>
              track.id === stoppedTrackId ? { ...track, blob } : track,
            ),
          )
        }

        recorder.onerror = () => {
          setError('Recording failed')
          recordingTrackIdRef.current = null
          setRecordingTrackId(null)
          recorderRef.current = null
          releaseRecordStream()
          disposeActiveSources()
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
        disposeActiveSources()
      }
    },
    [
      disposeActiveSources,
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

  const clearTrack = useCallback(
    (trackId: string) => {
      if (recordingTrackIdRef.current === trackId) {
        stopRecording()
      }
      if (playingTrackId === trackId) {
        stopPlayback()
      }

      setTracks((current) =>
        current.map((track) =>
          track.id === trackId
            ? { ...track, blob: null, isMuted: false, isSolo: false }
            : track,
        ),
      )
    },
    [playingTrackId, stopPlayback, stopRecording],
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
      const decoded = await Promise.all(
        playable.map(async (track) => decodeTrackBlob(context, track.blob!)),
      )

      const sampleRate = decoded[0]?.sampleRate ?? context.sampleRate
      const channels = Math.max(...decoded.map((buffer) => buffer.numberOfChannels))
      const length = Math.max(...decoded.map((buffer) => buffer.length))

      const offline = new OfflineAudioContext(channels, length, sampleRate)

      for (const buffer of decoded) {
        const source = offline.createBufferSource()
        source.buffer = buffer
        source.connect(offline.destination)
        source.start(0)
      }

      const rendered = await offline.startRendering()
      const blob = audioBufferToWav(rendered)

      return {
        blob,
        durationSeconds: rendered.duration,
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Mixdown failed',
      )
      return null
    } finally {
      setIsMixingDown(false)
    }
  }, [stopPlayback])

  useEffect(() => {
    return () => {
      disposeActiveSources()
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
    }
  }, [disposeActiveSources, releaseRecordStream])

  return {
    tracks,
    recordingTrackId,
    playingTrackId,
    isMixingDown,
    error,
    micStreamRef: monitorStreamRef,
    primeStudioAudio,
    startRecording,
    stopRecording,
    playTrack,
    stopPlayback,
    toggleMute,
    toggleSolo,
    clearTrack,
    mixdown,
  }
}
