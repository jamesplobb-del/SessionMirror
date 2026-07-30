import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { ArrowLeft, Mic, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LivePitchTuner from './LivePitchTuner'
import {
  acquireNativeTunerMonitor,
  recoverNativeTunerMonitor,
  releaseNativeTunerMonitor,
} from '../utils/nativeAudioPitchTap'
import {
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../utils/appSettings'
import { getTunerProfile, TUNER_INSTRUMENTS } from '../utils/pitchConfig'
import {
  isAppInForeground,
  subscribeAppForeground,
} from '../utils/appForeground'
import {
  QuickTunerPlugin,
  type QuickTunerLaunchRequest,
  type QuickTunerMicrophonePermissionStatus,
} from '../utils/quickTunerLaunch'
import { applyDarkHudStatusBar } from '../utils/nativeStatusBar'
import { triggerLightHaptic } from '../utils/haptics'

interface QuickTunerScreenProps {
  request: QuickTunerLaunchRequest
  onExit: () => void
}

function permissionCopy(status: QuickTunerMicrophonePermissionStatus): {
  title: string
  detail: string
} {
  if (status === 'denied') {
    return {
      title: 'Microphone access is off',
      detail: 'Allow microphone access in iOS Settings so Quick Tuner can hear your instrument.',
    }
  }
  if (status === 'unavailable') {
    return {
      title: 'Microphone unavailable',
      detail: 'No microphone input is currently available. Check your device audio input and try again.',
    }
  }
  return {
    title: 'Allow microphone access',
    detail: 'Quick Tuner only listens while this screen is open. Audio is not recorded or saved.',
  }
}

export default function QuickTunerScreen({ request, onExit }: QuickTunerScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings)
  const [permission, setPermission] =
    useState<QuickTunerMicrophonePermissionStatus>('notDetermined')
  const [permissionChecked, setPermissionChecked] = useState(!Capacitor.isNativePlatform())
  const [requestingPermission, setRequestingPermission] = useState(false)
  const [monitorEpoch, setMonitorEpoch] = useState(0)
  const [monitorReady, setMonitorReady] = useState(false)
  const [monitorAttemptComplete, setMonitorAttemptComplete] = useState(false)
  const [appForeground, setAppForeground] = useState(isAppInForeground)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

  useEffect(() => subscribeAppForeground(setAppForeground), [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('app-audio-mode')
    root.classList.toggle('app-dark-mode', settings.darkMode)
    root.style.colorScheme = settings.darkMode ? 'dark' : 'light'
    return () => {
      root.classList.remove('app-audio-mode', 'app-dark-mode')
      root.style.removeProperty('color-scheme')
    }
  }, [settings.darkMode])

  useEffect(() => {
    console.info('[QuickTuner] lightweight shell mounted', {
      source: request.source,
      coldLaunch: request.coldLaunch,
    })
    void applyDarkHudStatusBar()
    if (Capacitor.isNativePlatform()) {
      void SplashScreen.hide().catch(() => {})
    }
    return () => {
      console.info('[QuickTuner] lightweight shell unmounted', {
        source: request.source,
      })
    }
  }, [request.coldLaunch, request.source])

  useEffect(() => {
    let cancelled = false

    if (!isNativeIOS) {
      setPermission('granted')
      setPermissionChecked(true)
      return
    }

    void QuickTunerPlugin.getMicrophonePermissionStatus()
      .then(({ status }) => {
        if (cancelled) return
        setPermission(status)
        setPermissionChecked(true)
        console.info('[QuickTuner] microphone permission checked', { status })
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[QuickTuner] permission check failed', error)
        setPermission('unavailable')
        setPermissionChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [isNativeIOS])

  useEffect(() => {
    if (!appForeground || permission !== 'granted') {
      setMonitorReady(false)
      setMonitorAttemptComplete(false)
      return
    }

    let cancelled = false
    const acquired = isNativeIOS
    setMonitorAttemptComplete(false)
    console.info('[QuickTuner] tuner engine start requested', {
      source: request.source,
      micInputPreference: settings.micInputPreference,
    })
    void acquireNativeTunerMonitor(settings.micInputPreference).then((active) => {
      if (cancelled) return
      setMonitorReady(active || !isNativeIOS)
      setMonitorAttemptComplete(true)
      setMonitorEpoch((epoch) => epoch + 1)
      console.info('[QuickTuner] tuner engine started', {
        nativeMonitorActive: active,
        source: request.source,
      })
    })

    return () => {
      cancelled = true
      if (acquired) {
        console.info('[QuickTuner] tuner engine stop requested', {
          source: request.source,
        })
        void releaseNativeTunerMonitor().then(() => {
          console.info('[QuickTuner] tuner engine stopped', {
            source: request.source,
          })
        })
      }
    }
  }, [
    appForeground,
    isNativeIOS,
    permission,
    request.source,
    settings.micInputPreference,
  ])

  const handlePermissionRequest = useCallback(async () => {
    triggerLightHaptic(settings.hapticFeedback)
    if (!isNativeIOS) {
      setPermission('granted')
      return
    }
    setRequestingPermission(true)
    console.info('[QuickTuner] microphone permission request started', {
      source: request.source,
    })
    try {
      const { status } = await QuickTunerPlugin.requestMicrophonePermission()
      setPermission(status)
      console.info('[QuickTuner] microphone permission result', { status })
    } catch (error) {
      console.warn('[QuickTuner] microphone permission request failed', error)
      setPermission('unavailable')
    } finally {
      setRequestingPermission(false)
    }
  }, [isNativeIOS, settings.hapticFeedback])

  const handleOpenSettings = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    void QuickTunerPlugin.openAppSettings().catch((error) => {
      console.warn('[QuickTuner] failed to open app settings', error)
    })
  }, [settings.hapticFeedback])

  const handleExit = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    onExit()
  }, [onExit, settings.hapticFeedback])

  const updateInstrument = useCallback(
    (tunerInstrument: AppSettings['tunerInstrument']) => {
      triggerLightHaptic(settings.hapticFeedback)
      setSettings((current) => {
        const next = { ...current, tunerInstrument }
        saveAppSettings(next)
        return next
      })
    },
    [settings.hapticFeedback],
  )

  const retryMonitor = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setMonitorAttemptComplete(false)
    void recoverNativeTunerMonitor(settings.micInputPreference).then((active) => {
      setMonitorReady(active || !isNativeIOS)
      setMonitorAttemptComplete(true)
      setMonitorEpoch((epoch) => epoch + 1)
      console.info('[QuickTuner] tuner engine recovery result', { active })
    })
  }, [isNativeIOS, settings.hapticFeedback, settings.micInputPreference])

  const activeProfile = useMemo(
    () => getTunerProfile(settings.tunerInstrument),
    [settings.tunerInstrument],
  )
  const showTuner = permissionChecked && permission === 'granted'
  const permissionMessage = permissionCopy(permission)

  return (
    <main className="quick-tuner-screen app-ui-overlay--audio-mode">
      <header className="quick-tuner-header">
        <button
          type="button"
          className="quick-tuner-icon-button"
          onClick={handleExit}
          aria-label="Return to BestTake"
        >
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <p>BestTake</p>
          <h1>Quick Tuner</h1>
        </div>
        <span className="quick-tuner-live-badge">
          <span aria-hidden />
          Live
        </span>
      </header>

      <section className="quick-tuner-meta" aria-label="Tuner configuration">
        <span>A4 = 440 Hz</span>
        <span aria-hidden>·</span>
        <span>{activeProfile.label}</span>
        <span aria-hidden>·</span>
        <span>Concert pitch</span>
      </section>

      <section className="quick-tuner-stage" aria-label="Live tuner">
        {!permissionChecked ? (
          <div className="quick-tuner-permission">
            <span className="quick-tuner-permission__icon">
              <Mic aria-hidden />
            </span>
            <h2>Checking microphone…</h2>
          </div>
        ) : showTuner ? (
          <>
            <LivePitchTuner
              variant="audio"
              mediaRef={mediaRef}
              enabled={appForeground}
              isPlaying={false}
              mediaKey={`quick-tuner-${request.id}-${monitorEpoch}`}
              liveMicEnabled={appForeground}
              micStreamRef={streamRef}
              liveMicOnly
              tunerInstrument={settings.tunerInstrument}
            />
            {isNativeIOS && monitorAttemptComplete && !monitorReady ? (
              <button
                type="button"
                className="quick-tuner-retry"
                onClick={retryMonitor}
              >
                Tap to reconnect microphone
              </button>
            ) : null}
          </>
        ) : (
          <div className="quick-tuner-permission">
            <span className="quick-tuner-permission__icon">
              {permission === 'denied' ? <Settings2 aria-hidden /> : <Mic aria-hidden />}
            </span>
            <h2>{permissionMessage.title}</h2>
            <p>{permissionMessage.detail}</p>
            <button
              type="button"
              onClick={permission === 'denied' ? handleOpenSettings : handlePermissionRequest}
              disabled={requestingPermission}
            >
              {permission === 'denied'
                ? 'Open Settings'
                : requestingPermission
                  ? 'Requesting…'
                  : 'Allow Microphone'}
            </button>
          </div>
        )}
      </section>

      <footer className="quick-tuner-footer">
        <div className="quick-tuner-instrument-picker" aria-label="Source instrument">
          {TUNER_INSTRUMENTS.map((instrument) => (
            <button
              key={instrument}
              type="button"
              aria-pressed={settings.tunerInstrument === instrument}
              onClick={() => updateInstrument(instrument)}
            >
              {getTunerProfile(instrument).label}
            </button>
          ))}
        </div>
        <button type="button" className="quick-tuner-return" onClick={handleExit}>
          Return to full app
        </button>
      </footer>
    </main>
  )
}
