import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePipInlineDecoderOptions {
  suspendPlayback: boolean
  isAutoPlayArmed: boolean
  isPlaying: boolean
  videoSourceKey: string
}

/** Gates PiP `<video>` mount — poster when idle, decoder when playing or auto-play armed. */
export function usePipInlineDecoder({
  suspendPlayback,
  isAutoPlayArmed,
  isPlaying,
  videoSourceKey,
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
    if (!isPlaying && !isAutoPlayArmed) {
      setDecoderActive(false)
      pendingPlayRef.current = false
    }
  }, [isAutoPlayArmed, isPlaying])

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
