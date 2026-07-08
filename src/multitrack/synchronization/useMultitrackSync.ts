import { useCallback, useEffect, useRef, useState } from 'react'
import {
  playTakeMediaAudible,
  primeTakePlaybackForUserGesture,
} from '../../utils/takePlaybackAudio'
import { waitForMediaReady, waitForMediaProgressing } from '../../utils/mediaPlayback'
import { preparePlaybackRoute } from '../../utils/playbackRouteCoordinator'
import { resumePlaybackAudioContext } from '../../utils/playbackAudioContext'
import {
  hasTakePlaybackSpeakerRoute,
  routeTakePlaybackToSpeaker,
  updateTakePlaybackSpeakerGain,
} from '../../utils/takePlaybackSpeaker'
import { multitrackTransport } from './multitrackTransport'

/** Timeline drift past which a slaved element is hard-seeked back onto the transport. */
const SLAVE_TOLERANCE_SEC = 0.12
/** Gross deviation (stall / external scrub) past which the transport re-locks to real playback. */
const TRANSPORT_RELOCK_SEC = 0.25

function primeElementForPlayback(element: HTMLMediaElement): void {
  element.preload = 'auto'
  element.setAttribute('playsinline', 'true')
  routeTakePlaybackToSpeaker(element, 1, false)
}

export function useMultitrackSync() {
  const mediaMapRef = useRef<Map<string, HTMLMediaElement>>(new Map())
  const excludePanelIdRef = useRef<string | null>(null)
  /** Mixer state (per-panel playback balance). */
  const panelVolumeRef = useRef<Map<string, number>>(new Map())
  const panelMutedRef = useRef<Set<string>>(new Set())
  /** Per-take monitor mutes ("You'll hear" chips) — cleared after each recording. */
  const monitorMutedRef = useRef<Set<string>>(new Set())
  /** Per-panel trim: timeline 0 maps to `start` seconds into the take; `end` caps playback. */
  const panelTrimRef = useRef<Map<string, { start: number; end: number | null }>>(new Map())
  /** Per-panel timing sync offset (in milliseconds) from database metadata. */
  const panelOffsetRef = useRef<Map<string, number>>(new Map())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number | null>(null)
  /** Timeline position playback was prepared/started at (used to anchor the transport). */
  const preparedStartRef = useRef(0)
  /**
   * Panels whose clip enters the timeline later than the current position
   * (negative offset — dragged right in the align stage). They stay paused
   * until the transport reaches their entry point, then the rAF loop starts them.
   */
  const pendingStartRef = useRef<Set<string>>(new Set())
  /**
   * Chase mode (recording overdubs): transport is anchored to the metronome's
   * first click. References are positioned once at timeline 0 and free-run —
   * no per-frame seeks (those stall iOS video decoders and sound glitchy).
   */
  const chaseModeRef = useRef(false)
  const isPlayingRef = useRef(false)
  /** Fired when every clip has finished naturally (not on manual pause). */
  const onAllEndedRef = useRef<(() => void) | null>(null)
  /**
   * False until the transport has locked onto confirmed real playback for the
   * current roll. While false the reported timeline follows the reference
   * element directly (so startup latency isn't baked into the clock); once
   * playback is progressing we lock the transport to it and run on the audio clock.
   */
  const transportLockedRef = useRef(false)

  const applyMixState = useCallback((panelId: string, element: HTMLMediaElement) => {
    const volume = panelVolumeRef.current.get(panelId) ?? 1
    const muted =
      panelMutedRef.current.has(panelId) || monitorMutedRef.current.has(panelId)
    if (hasTakePlaybackSpeakerRoute(element)) {
      // Element output flows through the Web Audio bus. Muting the ELEMENT
      // makes iOS WKWebView stop decoding it (~1s) and starves the graph, so
      // the element stays unmuted and mixer volume/mute apply to the bus gain.
      element.muted = false
      if (element.volume <= 0) element.volume = 1
      updateTakePlaybackSpeakerGain(element, volume, muted)
    } else {
      element.volume = volume
      element.muted = muted
    }
  }, [])

  /** Playback helpers (playTakeMediaAudible) force unmute at start — reassert the mix after. */
  const applyMixStateToAll = useCallback(() => {
    for (const [panelId, element] of mediaMapRef.current.entries()) {
      applyMixState(panelId, element)
    }
  }, [applyMixState])

  const setPanelVolume = useCallback((panelId: string, volume: number) => {
    panelVolumeRef.current.set(panelId, Math.max(0, Math.min(1, volume)))
    const element = mediaMapRef.current.get(panelId)
    if (element) applyMixState(panelId, element)
  }, [applyMixState])

  const setPanelMuted = useCallback((panelId: string, muted: boolean) => {
    if (muted) panelMutedRef.current.add(panelId)
    else panelMutedRef.current.delete(panelId)
    const element = mediaMapRef.current.get(panelId)
    if (element) applyMixState(panelId, element)
  }, [applyMixState])

  const setMonitorMutedPanelIds = useCallback((panelIds: string[]) => {
    monitorMutedRef.current = new Set(panelIds)
    applyMixStateToAll()
  }, [applyMixStateToAll])

  const trimFor = useCallback((panelId: string) => {
    return panelTrimRef.current.get(panelId) ?? { start: 0, end: null }
  }, [])

  /** Untrimmed media duration of one panel (0 until metadata loads). */
  const getPanelMediaDuration = useCallback((panelId: string) => {
    const element = mediaMapRef.current.get(panelId)
    return element && Number.isFinite(element.duration) ? element.duration : 0
  }, [])

  const getEntries = useCallback((excludePanelId: string | null = excludePanelIdRef.current) => {
    return [...mediaMapRef.current.entries()].filter(([panelId]) => panelId !== excludePanelId)
  }, [])


  const setPanelOffsetInternal = useCallback((panelId: string, offsetMs: number) => {
    panelOffsetRef.current.set(panelId, offsetMs)
  }, [])

  const offsetFor = useCallback((panelId: string) => {
    return (panelOffsetRef.current.get(panelId) ?? 0) / 1000
  }, [])

  /**
   * Timeline model: timeline t maps to media time `t + trim.start + offset`.
   * The clip enters the timeline at `-offset` (positive offset = head skipped,
   * clip already mid-content at t=0; negative offset = clip enters later) and
   * exits at `trimEnd - trim.start - offset`.
   */
  const clipWindowFor = useCallback(
    (panelId: string, element: HTMLMediaElement) => {
      const raw = Number.isFinite(element.duration) ? element.duration : 0
      const trim = trimFor(panelId)
      const offset = offsetFor(panelId)
      const mediaEnd = trim.end !== null && raw > 0 ? Math.min(trim.end, raw) : trim.end ?? raw
      return {
        trimStart: trim.start,
        mediaEnd,
        entersAt: -offset,
        exitsAt: mediaEnd - trim.start - offset,
        offset,
      }
    },
    [offsetFor, trimFor],
  )

  /** Portion of the timeline this panel's media occupies (0 until metadata loads). */
  const effectiveDuration = useCallback((panelId: string, element: HTMLMediaElement) => {
    const raw = Number.isFinite(element.duration) ? element.duration : 0
    if (raw <= 0) return 0
    return Math.max(0, clipWindowFor(panelId, element).exitsAt)
  }, [clipWindowFor])

  /** Master = the entry with the longest trimmed duration. */
  const getMasterEntry = useCallback((): [string, HTMLMediaElement] | null => {
    let best: [string, HTMLMediaElement] | null = null
    let bestDuration = 0
    for (const entry of getEntries()) {
      const duration = effectiveDuration(entry[0], entry[1])
      if (duration > bestDuration) {
        bestDuration = duration
        best = entry
      }
    }
    return best
  }, [effectiveDuration, getEntries])

  const refreshDuration = useCallback(() => {
    const durations = getEntries(null)
      .map(([panelId, el]) => effectiveDuration(panelId, el))
      .filter((v) => Number.isFinite(v) && v > 0)
    setDuration(durations.length > 0 ? Math.max(...durations) : 0)
  }, [effectiveDuration, getEntries])

  const setPanelTrim = useCallback(
    (panelId: string, startSec: number, endSec: number | null) => {
      const start = Math.max(0, startSec)
      const end = endSec !== null && endSec > start ? endSec : null
      panelTrimRef.current.set(panelId, { start, end })
      refreshDuration()
    },
    [refreshDuration],
  )

  const setPanelOffset = useCallback((panelId: string, offsetMs: number) => {
    setPanelOffsetInternal(panelId, offsetMs)
    // Offsets shift where clips end on the timeline, so total duration changes.
    refreshDuration()
  }, [refreshDuration, setPanelOffsetInternal])

  const setExcludePanelId = useCallback((panelId: string | null) => {
    excludePanelIdRef.current = panelId
  }, [])

  const registerMedia = useCallback((panelId: string, element: HTMLMediaElement | null) => {
    const existing = mediaMapRef.current.get(panelId)
    if (element) {
      // loadedmetadata/canplay handlers re-register the same element — keep it
      // idempotent so we don't stack duplicate listeners.
      if (existing !== element) {
        if (existing) {
          existing.removeEventListener('loadedmetadata', refreshDuration)
          existing.removeEventListener('durationchange', refreshDuration)
        }
        mediaMapRef.current.set(panelId, element)
        element.addEventListener('loadedmetadata', refreshDuration)
        element.addEventListener('durationchange', refreshDuration)
      }
      applyMixState(panelId, element)
    } else {
      existing?.removeEventListener('loadedmetadata', refreshDuration)
      existing?.removeEventListener('durationchange', refreshDuration)
      mediaMapRef.current.delete(panelId)
      pendingStartRef.current.delete(panelId)
    }
    refreshDuration()
  }, [refreshDuration])

  /**
   * Seek every element to timeline `time`. Elements whose clip hasn't entered
   * the timeline yet (time < entersAt) are parked at their media start and, if
   * we're playing, paused + flagged pending so the rAF loop starts them on cue.
   */
  const syncAllTo = useCallback((time: number, excludePanelId: string | null = excludePanelIdRef.current) => {
    chaseModeRef.current = false
    for (const [panelId, el] of mediaMapRef.current.entries()) {
      if (panelId === excludePanelId) continue
      try {
        const win = clipWindowFor(panelId, el)
        const rawTarget = time + win.trimStart + win.offset
        // Don't clamp to mediaEnd before metadata loads (mediaEnd is 0 then).
        const upper = win.mediaEnd > win.trimStart ? win.mediaEnd : Number.POSITIVE_INFINITY
        const target = Math.min(Math.max(rawTarget, win.trimStart), upper)
        if (rawTarget < win.trimStart - 0.01) {
          // Clip enters later — park at its start and defer playback.
          if (!el.paused) el.pause()
          if (isPlayingRef.current) pendingStartRef.current.add(panelId)
        } else {
          pendingStartRef.current.delete(panelId)
        }
        if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target
      } catch {
        /* Some media elements reject seeks until metadata is ready. */
      }
    }
    // We just placed every element exactly at `time`, so the transport's
    // authoritative position is known — lock it there immediately.
    multitrackTransport.reanchor(time)
    transportLockedRef.current = true
    setCurrentTime(time)
  }, [clipWindowFor])

  const playElements = useCallback(async (entries: Array<[string, HTMLMediaElement]>, startTime: number) => {
    const elements = entries.map(([, el]) => el)
    if (elements.length === 0) return false

    chaseModeRef.current = false
    pendingStartRef.current.clear()
    const playNow: Array<[string, HTMLMediaElement]> = []

    for (const [panelId, el] of entries) {
      primeElementForPlayback(el)
      if (el.readyState < HTMLMediaElement.HAVE_METADATA && (el.src || el.currentSrc)) {
        try {
          el.load()
        } catch {
          /* ignore */
        }
      }
      try {
        const win = clipWindowFor(panelId, el)
        const rawTarget = startTime + win.trimStart + win.offset
        if (rawTarget < win.trimStart - 0.01) {
          // Clip enters the timeline later — park at its start; the rAF loop
          // starts it once the transport reaches its entry point.
          el.currentTime = win.trimStart
          pendingStartRef.current.add(panelId)
          continue
        }
        const upper = win.mediaEnd > win.trimStart ? win.mediaEnd : Number.POSITIVE_INFINITY
        el.currentTime = Math.min(rawTarget, upper)
      } catch {
        /* Seek rejected before metadata — still try to play below. */
      }
      playNow.push([panelId, el])
    }

    setCurrentTime(startTime)

    try {
      await preparePlaybackRoute({ suspendCamera: false })
    } catch {
      pendingStartRef.current.clear()
      return false
    }

    primeTakePlaybackForUserGesture(...elements)
    await resumePlaybackAudioContext()
    await Promise.allSettled(playNow.map(([, el]) => waitForMediaReady(el, 900)))

    const startResults = await Promise.allSettled(
      playNow.map(([, el]) =>
        playTakeMediaAudible(el, { skipRoutePrep: true, attachEndedRouteRestore: false }),
      ),
    )
    const starts = startResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        if (!result.value) {
          console.error('[useMultitrackSync] panel refused to start:', playNow[index][0])
        }
        return result.value
      }
      console.error('[useMultitrackSync] panel failed to start:', playNow[index][0], result.reason)
      return false
    })
    applyMixStateToAll()
    const playing = starts.some(Boolean) || pendingStartRef.current.size > 0
    if (playing) {
      // Roll the transport from the intended start; the rAF loop locks it onto
      // real playback once the elements are actually progressing.
      preparedStartRef.current = startTime
      transportLockedRef.current = false
      multitrackTransport.start(startTime)
    } else {
      pendingStartRef.current.clear()
    }
    setIsPlaying(playing)
    return playing
  }, [applyMixStateToAll, clipWindowFor])

  const prepareAtStart = useCallback(async (startTime = 0) => {
    preparedStartRef.current = startTime
    multitrackTransport.arm(startTime)
    transportLockedRef.current = false
    chaseModeRef.current = false
    const entries = getEntries()
    const elements = entries.map(([, el]) => el)

    pendingStartRef.current.clear()
    for (const [panelId, el] of entries) {
      primeElementForPlayback(el)
      if (el.readyState < HTMLMediaElement.HAVE_METADATA && (el.src || el.currentSrc)) {
        try {
          el.load()
        } catch {
          /* ignore */
        }
      }
      try {
        const win = clipWindowFor(panelId, el)
        const rawTarget = startTime + win.trimStart + win.offset
        if (rawTarget < win.trimStart - 0.01) {
          el.currentTime = win.trimStart
          pendingStartRef.current.add(panelId)
        } else {
          const upper = win.mediaEnd > win.trimStart ? win.mediaEnd : Number.POSITIVE_INFINITY
          el.currentTime = Math.min(rawTarget, upper)
        }
      } catch {
        /* ignore */
      }
      el.pause()
    }

    setCurrentTime(startTime)

    // Always wake the native "loud playback" audio route and resume the
    // shared WebAudio context here — even on the very first take of a
    // session, when there are no other panels' takes to play back yet. The
    // metronome count-in click shares this same route/context, and this was
    // the ONLY place that activated the native route (the metronome's own
    // start() only resumes the WebAudio AudioContext, not the underlying
    // AVAudioSession route). Gating this behind "are there reference
    // elements" meant the click was inaudible specifically on the first take
    // in every multitrack session, since that's the only recording with no
    // prior takes to reference.
    try {
      await preparePlaybackRoute({ suspendCamera: false })
    } catch {
      return elements.length === 0
    }

    if (elements.length === 0) return true

    primeTakePlaybackForUserGesture(...elements)
    await resumePlaybackAudioContext()
    await Promise.allSettled(elements.map((el) => waitForMediaReady(el, 2000)))
    return true
  }, [clipWindowFor, getEntries])

  const startPrepared = useCallback(async () => {
    const entries = getEntries()
    if (entries.length === 0) {
      setIsPlaying(false)
      return false
    }

    // Panels parked by prepareAtStart (clip enters later) stay paused — the
    // rAF loop starts them on cue.
    const playNow = entries.filter(([panelId]) => !pendingStartRef.current.has(panelId))
    const startResults = await Promise.allSettled(
      playNow.map(([, el]) =>
        playTakeMediaAudible(el, { skipRoutePrep: true, attachEndedRouteRestore: false }),
      ),
    )
    const starts = startResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        if (!result.value) {
          console.error('[useMultitrackSync] reference refused to start:', playNow[index][0])
        }
        return result.value
      }
      console.error('[useMultitrackSync] reference failed to start:', playNow[index][0], result.reason)
      return false
    })
    applyMixStateToAll()
    const audibleElements = playNow.filter((_entry, index) => starts[index]).map(([, el]) => el)
    if (audibleElements.length > 0) {
      await Promise.allSettled(
        audibleElements.map((el) => waitForMediaProgressing(el, { timeoutMs: 2000 })),
      )
    }
    const playing = starts.some(Boolean) || pendingStartRef.current.size > 0
    // startPrepared is idempotent (called again as a safety net after count-in);
    // only anchor the transport on the transition into rolling, never re-anchor
    // an already-rolling transport back to the start.
    if (playing && multitrackTransport.getState() !== 'rolling') {
      transportLockedRef.current = false
      multitrackTransport.start(preparedStartRef.current)
    }
    setIsPlaying(playing)
    return playing
  }, [applyMixStateToAll, getEntries])

  /**
   * Start reference playback for an overdub, timed to the metronome's click
   * grid. `firstClickCtxTime` is the sample-accurate AudioContext time of the
   * count-in's first click — that instant IS timeline 0. Each reference is
   * seeked once to its timeline-0 media position, then started and left to
   * free-run (no per-frame chase seeks).
   */
  const startAnchoredToClick = useCallback(async (firstClickCtxTime: number) => {
    const entries = getEntries()
    if (entries.length === 0) {
      return true
    }

    chaseModeRef.current = true
    transportLockedRef.current = true
    preparedStartRef.current = 0
    multitrackTransport.startAtClockTime(firstClickCtxTime)

    const playNow = entries.filter(([panelId]) => !pendingStartRef.current.has(panelId))

    for (const [panelId, el] of playNow) {
      try {
        const win = clipWindowFor(panelId, el)
        el.currentTime = Math.max(win.trimStart, win.trimStart + win.offset)
      } catch {
        /* metadata may not be ready yet */
      }
    }

    const startResults = await Promise.allSettled(
      playNow.map(([, el]) =>
        playTakeMediaAudible(el, { skipRoutePrep: true, attachEndedRouteRestore: false }),
      ),
    )
    const starts = startResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        if (!result.value) {
          console.error('[useMultitrackSync] anchored reference refused to start:', playNow[index][0])
        }
        return result.value
      }
      console.error('[useMultitrackSync] anchored reference failed to start:', playNow[index][0], result.reason)
      return false
    })
    applyMixStateToAll()

    const playing = starts.some(Boolean) || pendingStartRef.current.size > 0
    if (!playing) {
      chaseModeRef.current = false
    }
    setIsPlaying(playing)
    return playing
  }, [applyMixStateToAll, clipWindowFor, getEntries])

  const play = useCallback(async () => {
    const masterEntry = getMasterEntry()
    const startTime = masterEntry
      ? Math.max(0, masterEntry[1].currentTime - trimFor(masterEntry[0]).start - offsetFor(masterEntry[0]))
      : currentTime
    return playElements(getEntries(), startTime)
  }, [currentTime, getEntries, getMasterEntry, playElements, trimFor, offsetFor])

  const playAllFromUserGesture = useCallback(async () => {
    // Full reset — chase mode from recording leaves transport in a state that
    // blocks normal grouped playback if we only seek without clearing it.
    chaseModeRef.current = false
    pendingStartRef.current.clear()
    transportLockedRef.current = false
    multitrackTransport.arm(0)

    for (const [panelId, el] of getEntries()) {
      try {
        const win = clipWindowFor(panelId, el)
        const rawTarget = win.trimStart + win.offset
        const upper = win.mediaEnd > win.trimStart ? win.mediaEnd : Number.POSITIVE_INFINITY
        el.currentTime = Math.min(Math.max(rawTarget, win.trimStart), upper)
        el.pause()
      } catch {
        /* ignore */
      }
    }
    setCurrentTime(0)

    try {
      return await playElements(getEntries(), 0)
    } catch (error) {
      console.error('[useMultitrackSync] playAllFromUserGesture failed', error)
      setIsPlaying(false)
      return false
    }
  }, [clipWindowFor, getEntries, playElements])

  const pause = useCallback(() => {
    chaseModeRef.current = false
    pendingStartRef.current.clear()
    for (const el of mediaMapRef.current.values()) el.pause()
    multitrackTransport.pause()
    setIsPlaying(false)
  }, [])

  const restart = useCallback(async () => {
    chaseModeRef.current = false
    pendingStartRef.current.clear()
    transportLockedRef.current = false
    multitrackTransport.arm(0)

    for (const [panelId, el] of getEntries()) {
      try {
        const win = clipWindowFor(panelId, el)
        const rawTarget = win.trimStart + win.offset
        const upper = win.mediaEnd > win.trimStart ? win.mediaEnd : Number.POSITIVE_INFINITY
        el.currentTime = Math.min(Math.max(rawTarget, win.trimStart), upper)
        el.pause()
      } catch {
        /* ignore */
      }
    }
    setCurrentTime(0)

    try {
      await playElements(getEntries(), 0)
    } catch (error) {
      console.error('[useMultitrackSync] restart failed', error)
      setIsPlaying(false)
    }
  }, [clipWindowFor, getEntries, playElements])

  const seek = useCallback((time: number) => syncAllTo(time), [syncAllTo])

  const setOnAllEnded = useCallback((handler: (() => void) | null) => {
    onAllEndedRef.current = handler
  }, [])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = () => {
      const entries = getEntries()
      const pending = pendingStartRef.current
      const chasing = chaseModeRef.current

      // Master = longest clip that has actually entered the timeline; clips
      // still waiting for their entry point can't drive the clock. In chase
      // mode (recording to the click grid) NO element is master — the
      // transport is pinned to the metronome's first click and every element
      // is slaved onto it.
      let masterEntry: [string, HTMLMediaElement] | null = null
      let masterDuration = 0
      for (const entry of entries) {
        if (chasing) break
        if (pending.has(entry[0])) continue
        const dur = effectiveDuration(entry[0], entry[1])
        if (dur > masterDuration) {
          masterDuration = dur
          masterEntry = entry
        }
      }

      if (entries.length > 0) {
        let timeline = multitrackTransport.position()
        if (masterEntry) {
          const [masterId, master] = masterEntry
          // Reference position = the longest take's spot inside its trimmed window.
          const refPos = Math.max(0, master.currentTime - trimFor(masterId).start - offsetFor(masterId))
          const masterProgressing = !master.paused && !master.ended && master.currentTime > 0

          // Lock the transport onto real playback once it's actually progressing
          // (startup latency has settled), then run the timeline off the smooth
          // audio clock. Re-lock only on a gross deviation (stall / external scrub).
          if (!transportLockedRef.current) {
            if (masterProgressing) {
              multitrackTransport.reanchor(refPos)
              transportLockedRef.current = true
            }
          } else if (
            masterProgressing &&
            Math.abs(multitrackTransport.position() - refPos) > TRANSPORT_RELOCK_SEC
          ) {
            multitrackTransport.reanchor(refPos)
          }

          // Playback follows the transport — never the other way around.
          timeline = transportLockedRef.current ? multitrackTransport.position() : refPos
        }
        setCurrentTime(timeline)

        const allDone = entries.every(
          ([panelId, el]) => (el.paused || el.ended) && !pending.has(panelId),
        )
        if (allDone) {
          multitrackTransport.pause()
          setIsPlaying(false)
          onAllEndedRef.current?.()
          return
        }

        // In chase mode references free-run from their one-time start position —
        // only enforce trim-end pauses; never seek (seeks stall iOS decoders).
        if (chasing) {
          for (const [panelId, el] of entries) {
            try {
              const trim = trimFor(panelId)
              if (trim.end !== null && !el.paused && el.currentTime >= trim.end) {
                el.pause()
              }
            } catch {
              /* ignore */
            }
          }
          rafRef.current = requestAnimationFrame(tick)
          return
        }

        for (const [panelId, el] of entries) {
          try {
            const win = clipWindowFor(panelId, el)

            // Delayed entry: start clips whose entry point the timeline just crossed.
            if (pending.has(panelId)) {
              if (timeline >= win.entersAt - 0.02) {
                pending.delete(panelId)
                el.currentTime = Math.max(win.trimStart, timeline + win.trimStart + win.offset)
                void playTakeMediaAudible(el, {
                  skipRoutePrep: true,
                  attachEndedRouteRestore: false,
                }).then(() => applyMixState(panelId, el))
              }
              continue
            }

            // Trim end (media time): stop this take while the rest keep playing.
            const trim = trimFor(panelId)
            if (trim.end !== null && !el.paused && el.currentTime >= trim.end) {
              el.pause()
              continue
            }

            const deviation = Math.abs(el.currentTime - win.trimStart - win.offset - timeline)

            // Slave every non-reference element to the transport with a tight tolerance.
            if (
              (!masterEntry || el !== masterEntry[1]) &&
              !el.paused &&
              !el.ended &&
              deviation > SLAVE_TOLERANCE_SEC
            ) {
              el.currentTime = Math.max(win.trimStart, timeline + win.trimStart + win.offset)
            }
          } catch {
            /* ignore */
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [applyMixState, clipWindowFor, effectiveDuration, getEntries, isPlaying, trimFor, offsetFor])

  return {
    registerMedia,
    setExcludePanelId,
    setPanelVolume,
    setPanelMuted,
    setPanelTrim,
    setPanelOffset,
    getPanelMediaDuration,
    setMonitorMutedPanelIds,
    prepareAtStart,
    startPrepared,
    startAnchoredToClick,
    playAllFromUserGesture,
    play,
    pause,
    restart,
    seek,
    setOnAllEnded,
    state: { isPlaying, currentTime, duration },
  }
}
