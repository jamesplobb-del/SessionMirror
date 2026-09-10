// The full tuner uses native capture. The app's recording hook must relinquish
// its WebRTC microphone first, including requests still waiting for permission.
let nativeOwner = false
let generation = 0
const pending = new Set<Promise<MediaStream | null>>()
const listeners = new Set<(owned: boolean, restore: boolean) => void>()

export function nativeTunerOwnsMicrophone() { return nativeOwner }

export function subscribeTunerMicrophoneOwnership(listener: (owned: boolean, restore: boolean) => void) {
  listeners.add(listener)
  if (nativeOwner) listener(true, false)
  return () => { listeners.delete(listener) }
}

export function requestWebAudioStream(request: () => Promise<MediaStream>): Promise<MediaStream | null> {
  if (nativeOwner) return Promise.resolve(null)
  const requestGeneration = generation
  // Invoke synchronously: Safari's permission request needs the user's gesture.
  const work = request().then(stream => {
    if (nativeOwner || generation !== requestGeneration) {
      stream.getTracks().forEach(track => track.stop())
      return null
    }
    return stream
  })
  pending.add(work)
  void work.then(() => pending.delete(work), () => pending.delete(work))
  return work
}

export async function claimNativeTunerMicrophone() {
  if (!nativeOwner) {
    nativeOwner = true
    generation += 1
    for (const listener of listeners) listener(true, false)
  }
  // A late getUserMedia result is stopped above before native capture starts.
  await Promise.allSettled([...pending])
}

export function releaseNativeTunerMicrophone(restore = true) {
  if (!nativeOwner) return
  nativeOwner = false
  generation += 1
  for (const listener of listeners) listener(false, restore)
}
