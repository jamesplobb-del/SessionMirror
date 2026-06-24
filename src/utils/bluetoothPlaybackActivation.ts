import { Capacitor } from '@capacitor/core'
import { isBluetoothHeadphonePlaybackModeEnabled } from './audioOutputProfile'
import { getPlaybackAudioContext } from './playbackAudioContext'

const PLAY_RETRY_MS = 150
const SILENT_BUFFER_FRAMES = 256

export interface BluetoothActivationOptions {
  media?: HTMLMediaElement | null
  userVolume?: number
  attemptPlay?: boolean
}

async function playSilentActivationBuffer(ctx: AudioContext): Promise<void> {
  const buffer = ctx.createBuffer(1, SILENT_BUFFER_FRAMES, ctx.sampleRate)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)

  await new Promise<void>((resolve, reject) => {
    source.onended = () => resolve()
    try {
      source.start(0)
    } catch (error) {
      reject(error)
    }
  })
}

function prepareMediaElement(media: HTMLMediaElement, userVolume: number): void {
  if (
    media.readyState < HTMLMediaElement.HAVE_METADATA &&
    (media.src || media.currentSrc)
  ) {
    try {
      media.load()
    } catch {
      /* ignore */
    }
  }
  media.muted = false
  media.volume = Math.min(1, Math.max(0, userVolume))
}

async function attemptMediaPlay(media: HTMLMediaElement): Promise<boolean> {
  console.info('[BluetoothActivation] media play attempted')
  try {
    await media.play()
    console.info('[BluetoothActivation] success')
    return true
  } catch (firstError) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, PLAY_RETRY_MS)
    })
    try {
      await media.play()
      console.info('[BluetoothActivation] success')
      return true
    } catch (retryError) {
      console.warn('[BluetoothActivation] failure', retryError ?? firstError)
      return false
    }
  }
}

/**
 * Headphones-only Web Audio / HTMLMedia activation — does not run in speaker mode.
 * Does not use native AVAudioSession route APIs.
 */
export async function runBluetoothPlaybackActivation(
  options: BluetoothActivationOptions = {},
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  if (!isBluetoothHeadphonePlaybackModeEnabled()) return true

  console.info('[BluetoothActivation] start')

  try {
    const ctx = await getPlaybackAudioContext()
    console.info('[BluetoothActivation] audioContext resumed')

    await playSilentActivationBuffer(ctx)
    console.info('[BluetoothActivation] silent buffer played')
  } catch (error) {
    console.warn('[BluetoothActivation] failure', error)
    return false
  }

  const { media, userVolume = 1, attemptPlay = false } = options

  if (media) {
    prepareMediaElement(media, userVolume)
  }

  if (!attemptPlay || !media) {
    console.info('[BluetoothActivation] success')
    return true
  }

  return attemptMediaPlay(media)
}
