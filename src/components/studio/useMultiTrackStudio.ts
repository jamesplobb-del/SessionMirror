import { useCallback, useEffect, useRef, useState } from 'react'

export type TrackStatus = 'IDLE' | 'RECORDING' | 'PLAYING'

export interface StudioTrack {
  id: 1 | 2 | 3 | 4
  stream: MediaStream | null
  recordedUrl: string | null
  status: TrackStatus
}

const TRACK_IDS = [1, 2, 3, 4] as const

function makeInitialTracks(): StudioTrack[] {
  return TRACK_IDS.map((id) => ({
    id,
    stream: null,
    recordedUrl: null,
    status: 'IDLE' as TrackStatus,
  }))
}

function trackIndex(id: 1 | 2 | 3 | 4): number {
  return id - 1
}

function getBestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

export function useMultiTrackStudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  /** videoRefs[0] = track 1, videoRefs[3] = track 4 */
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIdRef = useRef<1 | 2 | 3 | 4 | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)

  const setVideoRef = useCallback((index: number, el: HTMLVideoElement | null) => {
    videoRefs.current[index] = el
  }, [])

  const pauseTrack = useCallback((id: 1 | 2 | 3 | 4) => {
    videoRefs.current[trackIndex(id)]?.pause()
    setTracks((prev) =>
      prev.map((t) => (t.id === id && t.status === 'PLAYING' ? { ...t, status: 'IDLE' } : t)),
    )
  }, [])

  const pauseAllExcept = useCallback((keepId: 1 | 2 | 3 | 4 | null) => {
    TRACK_IDS.forEach((id) => {
      if (id !== keepId) pauseTrack(id)
    })
  }, [pauseTrack])

  const startRecording = useCallback(async (id: 1 | 2 | 3 | 4) => {
    pauseAllExcept(null)

    liveStreamRef.current?.getTracks().forEach((t) => t.stop())
    liveStreamRef.current = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })

      liveStreamRef.current = stream
      chunksRef.current = []
      recordingIdRef.current = id

      const mimeType = getBestMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const trackId = recordingIdRef.current
        if (!trackId) return

        stream.getTracks().forEach((t) => t.stop())
        liveStreamRef.current = null

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        chunksRef.current = []
        recordingIdRef.current = null
        recorderRef.current = null

        setTracks((prev) => {
          const old = prev.find((t) => t.id === trackId)?.recordedUrl
          if (old) URL.revokeObjectURL(old)
          return prev.map((t) =>
            t.id === trackId
              ? { ...t, stream: null, recordedUrl: url, status: 'IDLE' as TrackStatus }
              : t,
          )
        })
      }

      recorder.start()
      recorderRef.current = recorder

      setTracks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, stream, status: 'RECORDING' as TrackStatus }
            : { ...t, stream: null, status: t.status === 'PLAYING' ? ('IDLE' as TrackStatus) : t.status },
        ),
      )
    } catch (err) {
      console.error('startRecording failed', err)
      setTracks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, stream: null, status: 'IDLE' as TrackStatus } : t)),
      )
    }
  }, [pauseAllExcept])

  const stopRecording = useCallback((id: 1 | 2 | 3 | 4) => {
    if (recordingIdRef.current !== id) return
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
  }, [])

  const playTrack = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      const track = tracksRef.current.find((t) => t.id === id)
      if (!track?.recordedUrl) return

      pauseAllExcept(id)

      setTracks((prev) =>
        prev.map((t) => {
          if (t.id === id) return { ...t, status: 'PLAYING' as TrackStatus }
          if (t.status === 'PLAYING') return { ...t, status: 'IDLE' as TrackStatus }
          return t
        }),
      )
    },
    [pauseAllExcept],
  )

  useEffect(() => {
    return () => {
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      recorderRef.current?.stop()
      tracksRef.current.forEach((t) => {
        if (t.recordedUrl) URL.revokeObjectURL(t.recordedUrl)
      })
    }
  }, [])

  return {
    tracks,
    videoRefs,
    setVideoRef,
    startRecording,
    stopRecording,
    playTrack,
    pauseTrack,
  }
}
