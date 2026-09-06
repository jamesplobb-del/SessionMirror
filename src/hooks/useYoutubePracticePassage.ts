import { useEffect, useRef, useState, type RefObject } from 'react'
import { loadPracticePassage, savePracticePassage, emptyPassage, type PracticePassage } from '../utils/practicePassages'
import { YOUTUBE_PROXY_ORIGIN } from '../utils/youtubeEmbed'
import { seekYoutubeProxy, startYoutubeProxyPlayback } from '../utils/playalong/youtubeBridge'

export function useYoutubePracticePassage({ projectId, videoId, iframeRef, recording, beforePlay }: {
  projectId: string | null; videoId: string | null; iframeRef: RefObject<HTMLIFrameElement | null>
  recording: boolean; beforePlay: () => void
}) {
  const [passage, setPassage] = useState<PracticePassage>(emptyPassage)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const current = useRef(passage)
  const blocked = useRef(recording)
  blocked.current = recording
  useEffect(() => {
    const initial = projectId && videoId ? loadPracticePassage(projectId, `youtube:${videoId}`) : emptyPassage()
    current.current = initial; setPassage(initial); setPosition(initial.positionSeconds)
    setDuration(null); setReady(false); setError('')
    if (!projectId || !videoId) return
    let restored = false, lastSave = 0, lastSeek = 0
    let lastState: number | null = null
    const persist = () => {
      try { savePracticePassage(projectId, `youtube:${videoId}`, current.current) }
      catch { setError('Could not remember this passage on your device.') }
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== YOUTUBE_PROXY_ORIGIN || event.source !== iframeRef.current?.contentWindow) return
      let data
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
      if (data?.event !== 'youtube-status' || data.videoId !== videoId || !data.iframeReady ||
        typeof data.currentTime !== 'number' || !Number.isFinite(data.currentTime) || data.currentTime < 0 ||
        typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0) return
      setReady(true); setDuration(data.duration)
      if (!restored) {
        restored = true
        const savedPosition = Math.min(current.current.positionSeconds, Math.max(0, data.duration - .5))
        if (savedPosition > 0) { seekYoutubeProxy(iframeRef.current, savedPosition); lastSeek = Date.now(); return }
      }
      // Ignore pre-seek telemetry until the existing proxy has processed the command.
      if (Date.now() - lastSeek < 700) return
      const nextPosition = Math.min(data.currentTime, data.duration)
      setPosition(nextPosition)
      current.current = { ...current.current, positionSeconds: nextPosition }
      const { startSeconds, endSeconds, loop } = current.current
      if (!blocked.current && data.playerState === 1 && loop && startSeconds !== null && endSeconds !== null &&
        endSeconds <= data.duration && nextPosition >= endSeconds) {
        seekYoutubeProxy(iframeRef.current, startSeconds); lastSeek = Date.now()
      }
      if (Date.now() - lastSave > 5000 || (data.playerState !== lastState && (data.playerState === 2 || data.playerState === 0))) {
        persist(); lastSave = Date.now()
      }
      lastState = data.playerState
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage); persist() }
  }, [projectId, videoId, iframeRef])
  const update = (patch: Partial<PracticePassage>) => {
    if (!projectId || !videoId) return
    try {
      current.current = savePracticePassage(projectId, `youtube:${videoId}`, { ...current.current, ...patch })
      setPassage(current.current); setError('')
    } catch { setError('Could not save this passage. Please try again.') }
  }
  const play = () => {
    if (!ready || blocked.current) return
    beforePlay()
    const start = current.current.startSeconds ?? current.current.positionSeconds
    seekYoutubeProxy(iframeRef.current, Math.min(start, Math.max(0, (duration ?? start + 1) - .5)))
    startYoutubeProxyPlayback(iframeRef.current)
  }
  return { passage, position, duration, ready, error, update, play }
}
