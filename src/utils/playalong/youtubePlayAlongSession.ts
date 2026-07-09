import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin, { type AudioRouteSnapshot } from '../audioSessionRoute'

export type YoutubeProxyPlayerState =
  | 'unknown'
  | 'unstarted'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'cued'

export interface YoutubePlayerTelemetry {
  playerState: YoutubeProxyPlayerState
  currentTime: number | null
  duration: number | null
  isMuted: boolean | null
  volume: number | null
  playbackRate: number | null
  iframeReady: boolean
  lastStateChangeAt: number | null
  bufferingCount: number
  videoId: string | null
  isSeeking: boolean | null
  videoLoadedFraction: number | null
  playbackQuality: string | null
  networkState: string | null
}

export interface YoutubePlayAlongSession {
  /** User loaded a YouTube reference URL. */
  youtubeEnabled: boolean
  /** User intentionally started play-along (pressed play / recording with YouTube). */
  userStartedPlayAlong: boolean
  /** Recording is active and YouTube is not excluded from the session. */
  recordingPlayAlongActive: boolean
  /** Parent expects the proxy player to be playing (during recording play-along). */
  expectedPlaying: boolean
}

export interface YoutubePlayAlongUiState {
  showTapToResume: boolean
  routeFailureMessage: string | null
}

const YT_NUMERIC_STATE: Record<number, YoutubeProxyPlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
}

const YT_STATE_LOG_LABEL: Record<YoutubeProxyPlayerState, string> = {
  unknown: 'UNKNOWN',
  unstarted: 'UNSTARTED',
  ready: 'READY',
  playing: 'PLAYING',
  paused: 'PAUSED',
  buffering: 'BUFFERING',
  ended: 'ENDED',
  cued: 'CUED',
}

export type YoutubePlaybackHealthCategory =
  | 'healthy'
  | 'route_failure'
  | 'iframe_paused'
  | 'iframe_buffering'
  | 'playback_stalled'
  | 'progress_ok_route_issue'
  | 'unknown'

function resetProgressTracker(): void {
  progressTracker = {
    lastCurrentTime: null,
    lastCheckAt: 0,
    lastReportedAdvanced: null,
    stallStartedAt: null,
    stallLogged: false,
    stallResumeAttempted: false,
    stallResumeAttemptAt: null,
    stallGiveUp: false,
  }
}

function resetStallEpisode(): void {
  progressTracker.stallStartedAt = null
  progressTracker.stallLogged = false
  progressTracker.stallResumeAttempted = false
  progressTracker.stallResumeAttemptAt = null
  progressTracker.stallGiveUp = false
}

function formatPlayerStateForLog(state: YoutubeProxyPlayerState): string {
  return YT_STATE_LOG_LABEL[state] ?? state.toUpperCase()
}

function classifyPlaybackHealth(
  route: AudioRouteSnapshot | null,
  advanced: boolean | null,
): YoutubePlaybackHealthCategory {
  const onHfp =
    (route?.inputPort ?? '').includes('BluetoothHFP') ||
    (route?.outputPort ?? '').includes('BluetoothHFP')
  const state = telemetry.playerState

  if (state === 'paused') return 'iframe_paused'
  if (state === 'buffering') return 'iframe_buffering'
  if (
    session.expectedPlaying &&
    state === 'playing' &&
    advanced === false &&
    progressTracker.stallStartedAt != null &&
    Date.now() - progressTracker.stallStartedAt >= STALL_THRESHOLD_MS
  ) {
    return 'playback_stalled'
  }
  if (onHfp && advanced === true) return 'progress_ok_route_issue'
  if (onHfp) return 'route_failure'
  if (state === 'playing' && advanced === true) return 'healthy'
  return 'unknown'
}

let session: YoutubePlayAlongSession = {
  youtubeEnabled: false,
  userStartedPlayAlong: false,
  recordingPlayAlongActive: false,
  expectedPlaying: false,
}

let telemetry: YoutubePlayerTelemetry = {
  playerState: 'unknown',
  currentTime: null,
  duration: null,
  isMuted: null,
  volume: null,
  playbackRate: null,
  iframeReady: false,
  lastStateChangeAt: null,
  bufferingCount: 0,
  videoId: null,
  isSeeking: null,
  videoLoadedFraction: null,
  playbackQuality: null,
  networkState: null,
}

let uiState: YoutubePlayAlongUiState = {
  showTapToResume: false,
  routeFailureMessage: null,
}

let lastRouteSnapshot: AudioRouteSnapshot | null = null
let hfpRouteFailureLogged = false
let lastSafeResumeAt = 0
let lastMaintainAt = 0
let diagTimer: number | null = null
let diagStatusSettleTimer: number | null = null

/** Minimum currentTime delta (seconds) over a 2s check to count as advancing. */
const PROGRESS_ADVANCE_MIN_SEC = 0.15
const STALL_THRESHOLD_MS = 3_000
const DIAG_STATUS_SETTLE_MS = 220

let progressTracker = {
  lastCurrentTime: null as number | null,
  lastCheckAt: 0,
  lastReportedAdvanced: null as boolean | null,
  stallStartedAt: null as number | null,
  stallLogged: false,
  stallResumeAttempted: false,
  stallResumeAttemptAt: null as number | null,
  stallGiveUp: false,
}

const SAFE_RESUME_COOLDOWN_MS = 12_000
const MAINTAIN_MIN_INTERVAL_MS = 4_000
const DIAG_INTERVAL_MS = 2_000

const sessionListeners = new Set<(next: YoutubePlayAlongSession) => void>()
const uiListeners = new Set<(next: YoutubePlayAlongUiState) => void>()

function notifySession(): void {
  const snapshot = { ...session }
  for (const listener of sessionListeners) listener(snapshot)
}

function notifyUi(): void {
  const snapshot = { ...uiState }
  for (const listener of uiListeners) listener(snapshot)
}

function setUi(patch: Partial<YoutubePlayAlongUiState>): void {
  uiState = { ...uiState, ...patch }
  notifyUi()
}

export function getYoutubePlayAlongSession(): YoutubePlayAlongSession {
  return { ...session }
}

export function getYoutubePlayerTelemetry(): YoutubePlayerTelemetry {
  return { ...telemetry }
}

export function getYoutubePlayAlongUiState(): YoutubePlayAlongUiState {
  return { ...uiState }
}

export function subscribeYoutubePlayAlongSession(
  listener: (next: YoutubePlayAlongSession) => void,
): () => void {
  sessionListeners.add(listener)
  listener({ ...session })
  return () => sessionListeners.delete(listener)
}

export function subscribeYoutubePlayAlongUi(
  listener: (next: YoutubePlayAlongUiState) => void,
): () => void {
  uiListeners.add(listener)
  listener({ ...uiState })
  return () => uiListeners.delete(listener)
}

export function setYoutubeReferenceEnabled(enabled: boolean): void {
  session = {
    ...session,
    youtubeEnabled: enabled,
    userStartedPlayAlong: enabled ? session.userStartedPlayAlong : false,
  }
  if (!enabled) {
    telemetry = {
      playerState: 'unknown',
      currentTime: null,
      duration: null,
      isMuted: null,
      volume: null,
      playbackRate: null,
      iframeReady: false,
      lastStateChangeAt: null,
      bufferingCount: telemetry.bufferingCount,
      videoId: null,
      isSeeking: null,
      videoLoadedFraction: null,
      playbackQuality: null,
      networkState: null,
    }
    resetProgressTracker()
    setUi({ showTapToResume: false, routeFailureMessage: null })
  }
  notifySession()
}

export function markYoutubePlayAlongUserStarted(): void {
  session = { ...session, userStartedPlayAlong: true, expectedPlaying: true }
  setUi({ showTapToResume: false })
  resetStallEpisode()
  notifySession()
}

export function markYoutubePlayAlongUserPaused(): void {
  session = { ...session, expectedPlaying: false }
  setUi({ showTapToResume: false })
  resetProgressTracker()
  notifySession()
}

export function setYoutubeRecordingPlayAlongActive(active: boolean): void {
  session = {
    ...session,
    recordingPlayAlongActive: active,
    expectedPlaying: active
      ? session.expectedPlaying || telemetry.playerState === 'playing'
      : false,
  }
  if (!active) {
    setUi({ showTapToResume: false })
    resetProgressTracker()
  }
  notifySession()
}

export function clearYoutubeTapToResume(): void {
  setUi({ showTapToResume: false })
}

export function ingestYoutubeProxyMessage(raw: unknown): void {
  if (typeof raw !== 'string') return
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }

  if (payload.event === 'youtube-state') {
    const state = String(payload.state ?? 'unknown') as YoutubeProxyPlayerState
    telemetry = {
      ...telemetry,
      playerState: state === 'ready' ? 'ready' : state,
      iframeReady: state === 'ready' || telemetry.iframeReady,
      lastStateChangeAt: Date.now(),
    }
    if (state === 'ready') telemetry.iframeReady = true
    if (state === 'buffering') {
      telemetry.bufferingCount += 1
    }
    return
  }

  if (payload.event !== 'youtube-status') return

  const numericState = typeof payload.playerState === 'number' ? payload.playerState : null
  const mappedState =
    numericState != null
      ? (YT_NUMERIC_STATE[numericState] ?? telemetry.playerState)
      : telemetry.playerState

  telemetry = {
    playerState: mappedState,
    currentTime: typeof payload.currentTime === 'number' ? payload.currentTime : null,
    duration: typeof payload.duration === 'number' ? payload.duration : null,
    isMuted: typeof payload.isMuted === 'boolean' ? payload.isMuted : null,
    volume: typeof payload.volume === 'number' ? payload.volume : null,
    playbackRate: typeof payload.playbackRate === 'number' ? payload.playbackRate : null,
    iframeReady: Boolean(payload.iframeReady ?? telemetry.iframeReady),
    lastStateChangeAt:
      typeof payload.lastStateChangeAt === 'number'
        ? payload.lastStateChangeAt
        : telemetry.lastStateChangeAt,
    bufferingCount:
      typeof payload.bufferingCount === 'number'
        ? payload.bufferingCount
        : telemetry.bufferingCount,
    videoId: typeof payload.videoId === 'string' ? payload.videoId : telemetry.videoId,
    isSeeking: typeof payload.isSeeking === 'boolean' ? payload.isSeeking : telemetry.isSeeking,
    videoLoadedFraction:
      typeof payload.videoLoadedFraction === 'number'
        ? payload.videoLoadedFraction
        : telemetry.videoLoadedFraction,
    playbackQuality:
      typeof payload.playbackQuality === 'string'
        ? payload.playbackQuality
        : telemetry.playbackQuality,
    networkState:
      typeof payload.networkState === 'string' ? payload.networkState : telemetry.networkState,
  }
}

export function shouldRunYoutubeRecordingMaintain(options: {
  iframe: HTMLIFrameElement | null | undefined
  recordingActive: boolean
}): { ok: boolean; reason?: string } {
  const { iframe, recordingActive } = options
  if (!recordingActive) return { ok: false, reason: 'not_recording' }
  if (!session.youtubeEnabled) return { ok: false, reason: 'youtube_disabled' }
  if (!session.expectedPlaying) return { ok: false, reason: 'user_paused' }
  if (!session.userStartedPlayAlong && !session.recordingPlayAlongActive) {
    return { ok: false, reason: 'play_along_not_started' }
  }
  if (!iframe?.contentWindow) return { ok: false, reason: 'missing_iframe' }
  if (!telemetry.iframeReady && telemetry.playerState === 'unknown') {
    return { ok: false, reason: 'iframe_not_ready' }
  }
  return { ok: true }
}

export function canAttemptSafeYoutubeResume(): boolean {
  return Date.now() - lastSafeResumeAt >= SAFE_RESUME_COOLDOWN_MS
}

export function markYoutubeSafeResumeAttempted(): void {
  lastSafeResumeAt = Date.now()
}

export function canFireYoutubeMaintain(): boolean {
  const now = Date.now()
  if (now - lastMaintainAt < MAINTAIN_MIN_INTERVAL_MS) return false
  lastMaintainAt = now
  return true
}

export function noteYoutubeMaintainSkipped(reason: string): void {
  console.info('[YoutubeRecordMaintain] skipped', { reason })
}

export function noteYoutubeMaintainFired(context: Record<string, unknown>): void {
  console.info('[YoutubeRecordMaintain] maintain fired', context)
}

async function refreshRouteSnapshot(): Promise<AudioRouteSnapshot | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const snapshot = await BestTakeAudioPlugin.getPlaybackOutputProfile()
    lastRouteSnapshot = snapshot
    return snapshot
  } catch {
    return lastRouteSnapshot
  }
}

function inspectRouteFailure(snapshot: AudioRouteSnapshot | null): void {
  if (!snapshot || hfpRouteFailureLogged) return
  const input = snapshot.inputPort ?? ''
  const output = snapshot.outputPort ?? ''
  const onHfp = input.includes('BluetoothHFP') || output.includes('BluetoothHFP')
  if (!onHfp) return

  hfpRouteFailureLogged = true
  console.warn('[YouTubePlayAlongRouteFailure]', {
    inputPort: input,
    outputPort: output,
    usesBuiltInMic: snapshot.usesBuiltInMic,
    usesA2DPOutput: snapshot.usesA2DPOutput,
    splitRouteAchieved: snapshot.splitRouteAchieved,
  })
  setUi({
    routeFailureMessage:
      'Headphones switched to headset mode. For best YouTube play-along audio, use iPhone mic + A2DP headphones when available.',
  })
}

export function requestYoutubePlayerStatus(
  postCommand: (func: string, args?: unknown[]) => void,
): void {
  postCommand('getStatus')
}

function logYoutubePlaybackProgress(options: {
  getRecordingElapsedMs: () => number
  getVideoId: () => string | null
  onStallResumeAttempt?: () => void
  route: AudioRouteSnapshot | null
}): void {
  if (!session.recordingPlayAlongActive || !session.expectedPlaying) {
    resetProgressTracker()
    return
  }

  const now = Date.now()
  const currentTime = telemetry.currentTime
  const playerState = telemetry.playerState
  const isSeeking = Boolean(telemetry.isSeeking)
  const videoDuration = telemetry.duration
  const lastVideoId = options.getVideoId() ?? telemetry.videoId
  const recordingElapsed = options.getRecordingElapsedMs()

  let deltaSinceLastCheck: number | null = null
  let advanced: boolean | null = null

  if (
    progressTracker.lastCurrentTime != null &&
    currentTime != null &&
    Number.isFinite(currentTime)
  ) {
    deltaSinceLastCheck = currentTime - progressTracker.lastCurrentTime
    advanced = deltaSinceLastCheck > PROGRESS_ADVANCE_MIN_SEC
  }

  const timeRemaining =
    videoDuration != null && currentTime != null && videoDuration > 0
      ? Math.max(0, videoDuration - currentTime)
      : null

  const playbackHealth = classifyPlaybackHealth(options.route, advanced)

  const canTrackStall =
    playerState === 'playing' &&
    !isSeeking &&
    currentTime != null &&
    telemetry.playbackRate !== 0

  if (canTrackStall && advanced === true) {
    resetStallEpisode()
    if (uiState.showTapToResume) {
      clearYoutubeTapToResume()
    }
  } else if (canTrackStall && advanced === false) {
    if (progressTracker.stallStartedAt == null) {
      progressTracker.stallStartedAt = now
    }
    const stallDurationMs = now - progressTracker.stallStartedAt

    if (stallDurationMs >= STALL_THRESHOLD_MS) {
      if (!progressTracker.stallLogged) {
        progressTracker.stallLogged = true
        console.warn('[YouTubePlaybackStalled]', {
          reason: 'currentTime_not_advancing',
          playerState: formatPlayerStateForLog(playerState),
          currentTime,
          deltaSinceLastCheck,
          stallDurationMs,
          lastVideoId,
          videoDuration,
          recordingElapsed,
          isSeeking,
          networkState: telemetry.networkState,
          videoLoadedFraction: telemetry.videoLoadedFraction,
        })
      }

      if (!progressTracker.stallResumeAttempted && !progressTracker.stallGiveUp) {
        progressTracker.stallResumeAttempted = true
        progressTracker.stallResumeAttemptAt = now
        console.info('[YouTubePlaybackStalled] attempting one resume')
        options.onStallResumeAttempt?.()
      } else if (
        progressTracker.stallResumeAttempted &&
        progressTracker.stallResumeAttemptAt != null &&
        !progressTracker.stallGiveUp &&
        now - progressTracker.stallResumeAttemptAt >= STALL_THRESHOLD_MS &&
        advanced === false
      ) {
        progressTracker.stallGiveUp = true
        console.warn('[YouTubePlaybackStalled] resume did not restore progress — tap to resume')
        markYoutubeResumeNeeded()
      }
    }
  } else if (playerState === 'paused' || playerState === 'buffering' || playerState === 'ended') {
    resetStallEpisode()
  }

  console.info('[YouTubePlaybackProgress]', {
    expectedPlaying: session.expectedPlaying,
    playerState: formatPlayerStateForLog(playerState),
    currentTime,
    deltaSinceLastCheck,
    advanced,
    lastVideoId,
    videoDuration,
    recordingElapsed,
    timeRemaining,
    isSeeking,
    networkState: telemetry.networkState,
    videoLoadedFraction: telemetry.videoLoadedFraction,
    playbackQuality: telemetry.playbackQuality,
    playbackHealth,
    inputPort: options.route?.inputPort,
    outputPort: options.route?.outputPort,
    usesA2DPOutput: options.route?.usesA2DPOutput,
    usesBluetoothHFP:
      (options.route?.inputPort ?? '').includes('BluetoothHFP') ||
      (options.route?.outputPort ?? '').includes('BluetoothHFP'),
  })

  if (currentTime != null && Number.isFinite(currentTime)) {
    progressTracker.lastCurrentTime = currentTime
  }
  progressTracker.lastReportedAdvanced = advanced
  progressTracker.lastCheckAt = now
}

export async function logYoutubePlayAlongDiag(options: {
  recordingActive: boolean
  youtubePlayerExists: boolean
  route?: AudioRouteSnapshot | null
}): Promise<void> {
  const route = options.route ?? (await refreshRouteSnapshot())
  if (session.recordingPlayAlongActive && options.route === undefined) {
    inspectRouteFailure(route)
  }

  const expectedPlaying = session.expectedPlaying
  const playerState = telemetry.playerState
  const shouldBePlaying = expectedPlaying && playerState !== 'playing' && playerState !== 'buffering'

  if (shouldBePlaying) {
    if (canAttemptSafeYoutubeResume()) {
      console.info('[YouTubePlayAlongDiag] expected playing but state=', playerState)
    } else {
      markYoutubeResumeNeeded()
    }
  }

  let advanced: boolean | null = progressTracker.lastReportedAdvanced

  console.info('[YouTubePlayAlongDiag]', {
    recordingActive: options.recordingActive,
    youtubeEnabled: session.youtubeEnabled,
    youtubePlayerExists: options.youtubePlayerExists,
    iframeReady: telemetry.iframeReady,
    playerState: telemetry.playerState,
    currentTime: telemetry.currentTime,
    duration: telemetry.duration,
    isMuted: telemetry.isMuted,
    volume: telemetry.volume,
    playbackRate: telemetry.playbackRate,
    expectedPlaying: session.expectedPlaying,
    lastStateChangeAt: telemetry.lastStateChangeAt,
    bufferingCount: telemetry.bufferingCount,
    videoId: telemetry.videoId,
    isSeeking: telemetry.isSeeking,
    networkState: telemetry.networkState,
    videoLoadedFraction: telemetry.videoLoadedFraction,
    inputPort: route?.inputPort,
    outputPort: route?.outputPort,
    usesBuiltInMic: route?.usesBuiltInMic,
    usesA2DPOutput: route?.usesA2DPOutput,
    usesBluetoothHFP:
      (route?.inputPort ?? '').includes('BluetoothHFP') ||
      (route?.outputPort ?? '').includes('BluetoothHFP'),
    splitRouteAchieved: route?.splitRouteAchieved,
    playbackHealth: classifyPlaybackHealth(route, advanced),
  })
}

export function startYoutubePlayAlongDiagnostics(options: {
  recordingActive: boolean
  getIframe: () => HTMLIFrameElement | null
  postCommand: (func: string, args?: unknown[]) => void
  getRecordingElapsedMs: () => number
  getVideoId: () => string | null
  onStallResumeAttempt?: () => void
}): void {
  stopYoutubePlayAlongDiagnostics()
  if (!options.recordingActive || !session.youtubeEnabled) return

  resetProgressTracker()

  const runProgressAndDiag = async () => {
    const iframe = options.getIframe()
    const route = await refreshRouteSnapshot()
    if (session.recordingPlayAlongActive) {
      inspectRouteFailure(route)
    }
    logYoutubePlaybackProgress({
      getRecordingElapsedMs: options.getRecordingElapsedMs,
      getVideoId: options.getVideoId,
      onStallResumeAttempt: options.onStallResumeAttempt,
      route,
    })
    await logYoutubePlayAlongDiag({
      recordingActive: options.recordingActive,
      youtubePlayerExists: Boolean(iframe),
      route,
    })
  }

  const tick = () => {
    requestYoutubePlayerStatus(options.postCommand)
    if (diagStatusSettleTimer !== null) {
      window.clearTimeout(diagStatusSettleTimer)
    }
    diagStatusSettleTimer = window.setTimeout(() => {
      diagStatusSettleTimer = null
      void runProgressAndDiag()
    }, DIAG_STATUS_SETTLE_MS)
  }

  tick()
  diagTimer = window.setInterval(tick, DIAG_INTERVAL_MS)
}

export function stopYoutubePlayAlongDiagnostics(): void {
  if (diagTimer !== null) {
    window.clearInterval(diagTimer)
    diagTimer = null
  }
  if (diagStatusSettleTimer !== null) {
    window.clearTimeout(diagStatusSettleTimer)
    diagStatusSettleTimer = null
  }
  resetProgressTracker()
}

export function resetYoutubePlayAlongRouteFailure(): void {
  hfpRouteFailureLogged = false
  setUi({ routeFailureMessage: null })
}

/** Manual device QA checklist for YouTube play-along while recording. */
export const YOUTUBE_PLAY_ALONG_ACCEPTANCE_CHECKS = [
  'AirPods connected; Use Device Mic enabled; YouTube play-along started',
  'Record 30s while listening — saved take contains iPhone mic only',
  'User hears YouTube entire time; YouTube audio not in recording',
  'Repeat with 10+ minute YouTube video — no pause/buffer loops',
  'No route thrashing between A2DP and HFP during recording',
  'No camera bridge/session recovery interrupting YouTube playback',
  'Long video: [YouTubePlaybackProgress] shows advanced=true every 2s while recording',
  'If iframe reports PLAYING but time stalls: [YouTubePlaybackStalled] then tap-to-resume',
] as const

export function markYoutubeResumeNeeded(): void {
  setUi({ showTapToResume: true })
}
