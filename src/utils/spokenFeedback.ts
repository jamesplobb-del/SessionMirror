import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import {
  acquireNativeTunerMonitor,
  releaseNativeTunerMonitor,
} from './nativeAudioPitchTap'
import { isNativeCaptureSessionActive } from './cameraSessionState'

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

let browserRecognition: BrowserSpeechRecognition | null = null
let nativeHandles: PluginListenerHandle[] = []
let nativeMonitorOwned = false

export async function startSpokenFeedback(options: {
  onTranscript: (transcript: string, isFinal: boolean) => void
  onError: (message: string) => void
  onEnd: () => void
}): Promise<void> {
  await stopSpokenFeedback().catch(() => undefined)

  if (Capacitor.isNativePlatform()) {
    try {
      nativeMonitorOwned = isNativeCaptureSessionActive()
        ? false
        : await acquireNativeTunerMonitor()
      nativeHandles = await Promise.all([
        BestTakeAudioPlugin.addListener('spokenFeedbackResult', (event) => {
          if (event.transcript) options.onTranscript(event.transcript, event.isFinal === true)
          if (event.isFinal) {
            options.onEnd()
            void stopSpokenFeedback()
          }
        }),
        BestTakeAudioPlugin.addListener('spokenFeedbackError', (event) => {
          options.onError(event.message ?? 'Speech recognition stopped.')
          options.onEnd()
          void stopSpokenFeedback()
        }),
      ])
      await BestTakeAudioPlugin.startSpokenFeedback()
      return
    } catch (error) {
      await stopSpokenFeedback().catch(() => undefined)
      throw error
    }
  }

  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
  const SpeechRecognition =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  if (!SpeechRecognition) throw new Error('Speech recognition is unavailable on this device.')

  const recognition = new SpeechRecognition()
  browserRecognition = recognition
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = navigator.language || 'en-US'
  recognition.onresult = (event) => {
    let transcript = ''
    let isFinal = false
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0]?.transcript ?? ''
      isFinal ||= event.results[index].isFinal
    }
    options.onTranscript(transcript.trim(), isFinal)
  }
  recognition.onerror = (event) => options.onError(event.error ?? 'Speech recognition stopped.')
  recognition.onend = options.onEnd
  recognition.start()
}

export async function stopSpokenFeedback(): Promise<string> {
  const recognition = browserRecognition
  browserRecognition = null
  if (recognition) {
    recognition.onend = null
    recognition.stop()
  }

  let transcript = ''
  if (Capacitor.isNativePlatform()) {
    try {
      transcript = (await BestTakeAudioPlugin.stopSpokenFeedback()).transcript ?? ''
    } catch {
      // Stopping an already-finished recognizer is intentionally harmless.
    }
    if (nativeMonitorOwned) {
      nativeMonitorOwned = false
      await releaseNativeTunerMonitor().catch(() => undefined)
    }
  }
  const handles = nativeHandles
  nativeHandles = []
  await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)))
  return transcript
}
