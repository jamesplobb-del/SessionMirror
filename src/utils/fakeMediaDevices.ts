/**
 * Synthetic camera and microphone, for looking at the UI in a desktop browser.
 *
 * The browser preview has no camera or mic, so `getUserMedia` rejects with
 * `NotAllowedError` and the whole app sits behind CameraPermissionPrompt's
 * "Access is turned off" wall — you cannot see a single practice screen.
 *
 * Off unless the build is made with `VITE_FAKE_MEDIA=1`:
 *
 *     VITE_FAKE_MEDIA=1 npm run build
 *
 * Vite inlines that comparison at build time, so in an ordinary build the
 * constant is `false`, `installFakeMediaDevices()` compiles to an empty
 * function and the generators below are dropped from the bundle. There is no
 * runtime toggle, so it cannot reach a release build by accident.
 *
 * This replaces ONLY `navigator.mediaDevices.getUserMedia` (plus
 * `enumerateDevices`, so device pickers have something to list). Every hook,
 * permission branch, track-teardown path and recorder downstream of it runs
 * exactly as it does with real hardware — what you are looking at is the real
 * UI, fed a real MediaStream that happens to be generated.
 */

export const FAKE_MEDIA = import.meta.env.VITE_FAKE_MEDIA === '1'

/** Concert A. A tuner pointed at this should read A4, dead centre. */
const TONE_HZ = 440

/**
 * A moving picture, not a still: a frozen frame is indistinguishable from a
 * hung preview, and several code paths wait on real frames arriving.
 */
function createFakeVideoTrack(width: number, height: number): MediaStreamTrack {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  let frame = 0
  const draw = () => {
    if (!context) return
    const t = frame / 60

    const sky = context.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#1b2739')
    sky.addColorStop(1, '#0b1119')
    context.fillStyle = sky
    context.fillRect(0, 0, width, height)

    // Gold/blue waveform, so the fake feed is recognisably BestTake's.
    const midY = height / 2
    const bars = 48
    for (let index = 0; index < bars; index += 1) {
      const x = (index / bars) * width
      const wave = Math.sin(t * 2 + index * 0.42) * Math.sin(t * 0.7 + index * 0.11)
      const barHeight = Math.abs(wave) * height * 0.3 + 8
      context.fillStyle = index % 2 ? 'rgba(21, 152, 255, 0.75)' : 'rgba(247, 166, 0, 0.75)'
      context.fillRect(x, midY - barHeight / 2, width / bars - 6, barHeight)
    }

    context.fillStyle = 'rgba(255, 255, 255, 0.62)'
    context.font = `600 ${Math.round(height * 0.038)}px -apple-system, system-ui, sans-serif`
    context.textAlign = 'center'
    context.fillText('SYNTHETIC CAMERA · VITE_FAKE_MEDIA=1', width / 2, height * 0.86)

    frame += 1
  }

  draw()
  const stream = canvas.captureStream(30)
  window.setInterval(draw, 1000 / 30)
  return stream.getVideoTracks()[0]
}

/**
 * A quiet, steady A440. Loud enough for the pitch tracker to lock onto so the
 * tuner and the practice games have something to show, quiet enough that a
 * playback check does not blast you.
 */
function createFakeAudioTrack(): MediaStreamTrack {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return new MediaStream().getAudioTracks()[0]

  const context = new AudioContextCtor()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const destination = context.createMediaStreamDestination()

  oscillator.type = 'sine'
  oscillator.frequency.value = TONE_HZ
  gain.gain.value = 0.08
  oscillator.connect(gain).connect(destination)
  oscillator.start()

  // Autoplay policy: the context starts suspended until the page has been
  // interacted with, and a suspended context emits digital silence.
  const resume = () => void context.resume()
  void context.resume()
  window.addEventListener('pointerdown', resume, { once: true })

  return destination.stream.getAudioTracks()[0]
}

export function installFakeMediaDevices(): void {
  if (!FAKE_MEDIA) return
  if (typeof navigator === 'undefined') return

  // Safari exposes mediaDevices as a getter on the prototype, and it is absent
  // entirely on insecure origins — define the object when it is missing.
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {} as MediaDevices,
      configurable: true,
    })
  }

  const devices = navigator.mediaDevices

  devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = new MediaStream()
    if (constraints?.video) {
      const video = typeof constraints.video === 'object' ? constraints.video : {}
      const width = Number((video.width as ConstrainULongRange)?.ideal ?? video.width ?? 1280)
      const height = Number((video.height as ConstrainULongRange)?.ideal ?? video.height ?? 720)
      stream.addTrack(createFakeVideoTrack(width || 1280, height || 720))
    }
    if (constraints?.audio) {
      const track = createFakeAudioTrack()
      if (track) stream.addTrack(track)
    }
    console.info('[FakeMedia] getUserMedia', constraints, '→', stream.getTracks().length, 'tracks')
    return stream
  }

  devices.enumerateDevices = async () =>
    [
      { deviceId: 'fake-camera', groupId: 'fake', kind: 'videoinput', label: 'Synthetic Camera' },
      { deviceId: 'fake-mic', groupId: 'fake', kind: 'audioinput', label: 'Synthetic Microphone' },
    ].map((device) => ({ ...device, toJSON: () => device })) as MediaDeviceInfo[]

  console.info('[FakeMedia] synthetic camera and microphone installed')
}
