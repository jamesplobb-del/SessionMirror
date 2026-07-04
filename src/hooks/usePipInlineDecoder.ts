import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface UsePipInlineDecoderOptions {
  suspendPlayback: boolean
  isAutoPlayArmed: boolean
  isPlaying: boolean
  videoSourceKey: string
  videoRef?: RefObject<HTMLMediaElement | null>
}

/** Gates PiP `<video>` mount — poster when idle, decoder when playing or auto-play armed. */
export function usePipInlineDecoder({
  suspendPlayback,
  isAutoPlayArmed,
  isPlaying,
  videoSourceKey,
  videoRef,
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
    if (isAutoPlayArmed || isPlaying) return
    const media = videoRef?.current
    if (media && !media.paused && !media.ended) return
    setDecoderActive(false)
    pendingPlayRef.current = false
  }, [isAutoPlayArmed, isPlaying, videoRef, videoSourceKey])

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
