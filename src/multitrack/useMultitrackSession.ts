import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { assignMediaPlaybackSrc, prepareInlineMediaElement } from '../utils/mediaPlayback'
import { routeTakePlaybackToSpeaker, updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import { primeTakePlaybackForUserGesture } from '../utils/takePlaybackAudio'
import {
  pauseYoutubeProxy,
  setYoutubeProxyVolumeFromUi,
  startYoutubeProxyPlayback,
} from '../utils/playalong/youtubeBridge'
import { buildYoutubeProxyUrl, parseYoutubeVideoId } from '../utils/youtubeEmbed'
import { sharedMetronomeEngine } from '../metronome/sharedMetronomeEngine'
import { createMultitrackKey, loadMultitrackBlob, saveMultitrackBlob } from './multitrackStorage'
import {
  DEFAULT_MIXER,
  type MultitrackBackingTrack,
  type MultitrackBox,
  type MultitrackMixerLevels,
} from './types'

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
      audio.remove()
    }
    audio.onerror = () => {
      resolve(0)
      audio.remove()
    }
    audio.src = url
  })
}

export function useMultitrackSession(options: {
  isOpen: boolean
  micStreamRef: RefObject<MediaStream | null>
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
}) {
  const { isOpen, micStreamRef, youtubeIframeRef } = options

  const backingRef = useRef<HTMLAudioElement | null>(null)
  const boxAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])

  const [backing, setBacking] = useState<MultitrackBackingTrack | null>(null)
  const [boxes, setBoxes] = useState<MultitrackBox[]>([])
  const [mixer, setMixer] = useState<MultitrackMixerLevels>(DEFAULT_MIXER)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetSession = useCallback(() => {
    backingRef.current?.pause()
    boxAudioRefs.current.forEach((audio) => {
      audio.pause()
      URL.revokeObjectURL(audio.src)
    })
    boxAudioRefs.current.clear()
    boxes.forEach((box) => URL.revokeObjectURL(box.objectUrl))
    if (backing?.objectUrl) URL.revokeObjectURL(backing.objectUrl)
    setBacking(null)
    setBoxes([])
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setError(null)
    sharedMetronomeEngine.setOutputGainMultiplier(1)
  }, [backing?.objectUrl, boxes])

  useEffect(() => {
    if (!isOpen) {
      resetSession()
      pauseYoutubeProxy(youtubeIframeRef.current)
    }
  }, [isOpen, resetSession, youtubeIframeRef])

  useEffect(() => {
    sharedMetronomeEngine.setOutputGainMultiplier(mixer.metronome / 100)
    return () => sharedMetronomeEngine.setOutputGainMultiplier(1)
  }, [mixer.metronome])

  const syncBoxVolumes = useCallback(() => {
    const gain = mixer.performance / 100
    boxAudioRefs.current.forEach((audio) => {
      audio.volume = gain
      updateTakePlaybackSpeakerGain(audio, gain, gain <= 0)
    })
  }, [mixer.performance])

  useEffect(() => {
    syncBoxVolumes()
  }, [syncBoxVolumes, boxes])

  const applyBackingVolume = useCallback(() => {
    const backingEl = backingRef.current
    const gain = mixer.backing / 100
    if (backingEl) {
      routeTakePlaybackToSpeaker(backingEl, gain, gain <= 0)
      updateTakePlaybackSpeakerGain(backingEl, gain, gain <= 0)
    }
    if (backing?.kind === 'youtube') {
      setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, mixer.backing)
    }
  }, [backing?.kind, mixer.backing, youtubeIframeRef])

  useEffect(() => {
    applyBackingVolume()
  }, [applyBackingVolume])

  const syncLayersToMaster = useCallback((masterTime: number) => {
    boxAudioRefs.current.forEach((audio, boxId) => {
      const box = boxes.find((item) => item.id === boxId)
      if (!box) return
      const target = Math.min(masterTime, box.duration || audio.duration || masterTime)
      if (Math.abs(audio.currentTime - target) > 0.08) {
        audio.currentTime = target
      }
    })
  }, [boxes])

  const importMp3 = useCallback(async (file: File) => {
    setError(null)
    const key = createMultitrackKey('backing')
    await saveMultitrackBlob(key, file)
    const objectUrl = URL.createObjectURL(file)
    const probed = await probeDuration(objectUrl)
    setBacking({
      kind: 'mp3',
      name: file.name,
      storageKey: key,
      objectUrl,
      duration: probed,
    })
    setDuration(probed)
    setCurrentTime(0)
  }, [])

  const setYoutubeBacking = useCallback((input: string, title = 'YouTube play-along') => {
    setError(null)
    const videoId = parseYoutubeVideoId(input)
    if (!videoId) {
      setError('Paste a valid YouTube URL or video ID.')
      return
    }
    if (backing?.objectUrl) URL.revokeObjectURL(backing.objectUrl)
    setBacking({
      kind: 'youtube',
      name: title,
      youtubeUrl: buildYoutubeProxyUrl(videoId),
      duration: 0,
    })
    setDuration(0)
    setCurrentTime(0)
  }, [backing?.objectUrl])

  useEffect(() => {
    const el = backingRef.current
    if (!isOpen || !el || backing?.kind !== 'mp3' || !backing.objectUrl) return

    prepareInlineMediaElement(el)
    assignMediaPlaybackSrc(el, backing.objectUrl)
    primeTakePlaybackForUserGesture(el)

    const onTime = () => {
      setCurrentTime(el.currentTime)
      syncLayersToMaster(el.currentTime)
    }
    const onMeta = () => {
      if (el.duration && Number.isFinite(el.duration)) {
        setDuration(el.duration)
      }
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    onMeta()
    applyBackingVolume()

    return () => {
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
    }
  }, [applyBackingVolume, backing, isOpen, syncLayersToMaster])

  const ensureBoxAudio = useCallback((box: MultitrackBox) => {
    let audio = boxAudioRefs.current.get(box.id)
    if (audio) return audio
    audio = document.createElement('audio')
    prepareInlineMediaElement(audio)
    assignMediaPlaybackSrc(audio, box.objectUrl)
    primeTakePlaybackForUserGesture(audio)
    audio.volume = mixer.performance / 100
    boxAudioRefs.current.set(box.id, audio)
    return audio
  }, [mixer.performance])

  const playAll = useCallback(async () => {
    if (!backing || (backing.kind === 'mp3' && !backing.objectUrl)) {
      setError('Import a backing track first.')
      return
    }

    if (backing.kind === 'youtube' && backing.youtubeUrl) {
      startYoutubeProxyPlayback(youtubeIframeRef.current, 1)
      setIsPlaying(true)
      boxes.forEach((box) => {
        const audio = ensureBoxAudio(box)
        void audio.play().catch(() => undefined)
      })
      return
    }

    const master = backingRef.current
    if (!master) return
    try {
      await master.play()
      setIsPlaying(true)
      boxes.forEach((box) => {
        const audio = ensureBoxAudio(box)
        audio.currentTime = master.currentTime
        void audio.play().catch(() => undefined)
      })
    } catch {
      setError('Playback blocked — tap play again.')
    }
  }, [backing, boxes, ensureBoxAudio, youtubeIframeRef])

  const pauseAll = useCallback(() => {
    backingRef.current?.pause()
    pauseYoutubeProxy(youtubeIframeRef.current)
    boxAudioRefs.current.forEach((audio) => audio.pause())
    setIsPlaying(false)
  }, [youtubeIframeRef])

  const restartAll = useCallback(() => {
    const master = backingRef.current
    if (master) master.currentTime = 0
    setCurrentTime(0)
    boxAudioRefs.current.forEach((audio) => {
      audio.currentTime = 0
    })
    if (isPlaying) void playAll()
  }, [isPlaying, playAll])

  const startRecordingBox = useCallback(async () => {
    const micStream = micStreamRef.current
    if (!micStream) {
      setError('Microphone is not available.')
      return
    }
    if (!backing) {
      setError('Set a backing track before recording.')
      return
    }
    if (isRecording) return

    setError(null)
    recordChunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : ''

    const recorder = mimeType
      ? new MediaRecorder(micStream, { mimeType })
      : new MediaRecorder(micStream)

    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordChunksRef.current.push(event.data)
    }

    const masterTime = backingRef.current?.currentTime ?? 0
    if (!isPlaying) {
      await playAll()
      if (backingRef.current) backingRef.current.currentTime = masterTime
    }

    recorder.start(250)
    setIsRecording(true)
  }, [backing, isPlaying, isRecording, micStreamRef, playAll])

  const stopRecordingBox = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    const blob = new Blob(recordChunksRef.current, {
      type: recorder.mimeType || 'audio/webm',
    })
    const key = createMultitrackKey('box')
    await saveMultitrackBlob(key, blob)
    const objectUrl = URL.createObjectURL(blob)
    const probed = await probeDuration(objectUrl)
    const box: MultitrackBox = {
      id: `box-${Date.now()}`,
      name: `Box ${boxes.length + 1}`,
      storageKey: key,
      objectUrl,
      duration: probed,
      recordedAt: Date.now(),
    }

    setBoxes((prev) => [...prev, box])
    ensureBoxAudio(box)
    setIsRecording(false)
    recorderRef.current = null
    recordChunksRef.current = []
  }, [boxes.length, ensureBoxAudio])

  const removeBox = useCallback((boxId: string) => {
    const audio = boxAudioRefs.current.get(boxId)
    if (audio) {
      audio.pause()
      URL.revokeObjectURL(audio.src)
      boxAudioRefs.current.delete(boxId)
    }
    setBoxes((prev) => {
      const target = prev.find((item) => item.id === boxId)
      if (target) URL.revokeObjectURL(target.objectUrl)
      return prev.filter((item) => item.id !== boxId)
    })
  }, [])

  const updateMixer = useCallback((patch: Partial<MultitrackMixerLevels>) => {
    setMixer((prev) => ({ ...prev, ...patch }))
  }, [])

  return {
    backingRef,
    backing,
    boxes,
    mixer,
    updateMixer,
    isPlaying,
    isRecording,
    currentTime,
    duration,
    error,
    importMp3,
    setYoutubeBacking,
    playAll,
    pauseAll,
    restartAll,
    startRecordingBox,
    stopRecordingBox,
    removeBox,
    resetSession,
    loadMultitrackBlob,
  }
}
