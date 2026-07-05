import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'

interface UsePipInlineDecoderOptions {
  suspendPlayback: boolean
  isAutoPlayArmed: boolean
  isPlaying: boolean
  videoSourceKey: string
  mediaRef: RefObject<HTMLMediaElement | null>
}

function isMediaActivelyPlaying(media: HTMLMediaElement | null | undefined): boolean {
  return Boolean(media && !media.paused && !media.ended)
}

/** Gates PiP `<video>` mount — poster when idle, decoder when playing or auto-play armed. */
export function usePipInlineDecoder({
  suspendPlayback,
  isAutoPlayArmed,
  isPlaying,
  videoSourceKey,
  mediaRef,
}: UsePipInlineDecoderOptions) {
  const [decoderActive, setDecoderActive] = useState(isAutoPlayArmed)
  const pendingPlayRef = useRef(false)
  const prevSourceKeyRef = useRef(videoSourceKey)

  useEffect(() => {
    if (isAutoPlayArmed) {
      setDecoderActive(true)
    }
  }, [isAutoPlayArmed])

  useEffect(() => {
    if (prevSourceKeyRef.current === videoSourceKey) return
    prevSourceKeyRef.current = videoSourceKey
    setDecoderActive(false)
    pendingPlayRef.current = false
  }, [videoSourceKey])

  useEffect(() => {
    if (suspendPlayback) {
      setDecoderActive(false)
      pendingPlayRef.current = false
    }
  }, [suspendPlayback])

  useEffect(() => {
    if (isPlaying || isAutoPlayArmed) return
    if (isMediaActivelyPlaying(mediaRef.current)) return
    setDecoderActive(false)
    pendingPlayRef.current = false
  }, [isAutoPlayArmed, isPlaying, mediaRef])

  useEffect(() => {
    if (!decoderActive) return

    const syncDecoderWithMedia = () => {
      if (isMediaActivelyPlaying(mediaRef.current)) {
        setDecoderActive(true)
      }
    }

    syncDecoderWithMedia()
    const intervalId = window.setInterval(syncDecoderWithMedia, 1000)
    return () => window.clearInterval(intervalId)
  }, [decoderActive, mediaRef])

  const requestDecoderForPlay = useCallback(() => {
    pendingPlayRef.current = true
    setDecoderActive(true)
  }, [])

  const clearPendingPlay = useCallback(() => {
    pendingPlayRef.current = false
  }, [])

  return {
    decoderActive,
    pendingPlayRef,
    requestDecoderForPlay,
    clearPendingPlay,
  }
}
