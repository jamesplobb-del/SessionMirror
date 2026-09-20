import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './takeStorage'
import { enhancementParamsForSource, registerRenderedEnhancementSource, takePlaybackEnhancerRevision } from './takePlaybackSpeaker'
import { queueAudioEnhancement } from './enhancementQueue'

// Store resolved promises too: replay and comparisons reuse exactly the same
// rendered file. Native previews live in Caches, cleared on the next cold run.
const previews = new Map<string, Promise<string>>()
export async function prepareNaturalTakePreview(source: string, mediaType: 'audio' | 'video'): Promise<string> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return source
  const revision = takePlaybackEnhancerRevision()
  const params = enhancementParamsForSource(source)
  if (!params) return source
  let nativePath = source
  const marker = '/_capacitor_file_/'
  if (source.includes(marker)) nativePath = 'file:///' + decodeURIComponent(source.split(marker)[1].split(/[?#]/)[0])
  // Uploaded remote references must never be sent to a local file renderer.
  if (/^(https?:|blob:|data:|capacitor:)/.test(nativePath)) return source
  const url = await resolveNativeFileUri(nativePath)
  if (!url) throw new Error('This recording could not be opened for enhancement.')
  const key = JSON.stringify([url, mediaType, params])
  let pending = previews.get(key)
  if (!pending) {
    pending = new Promise<string>((resolve, reject) => {
      void queueAudioEnhancement(async () => {
        try {
          const result = await BestTakeAudioPlugin.enhanceTakeAudio({ url, mediaType, params, preview: true })
          if (!result.enhanced || !result.path || !Number.isFinite(result.duration) || result.duration <= 0) {
            throw new Error('Audio enhancement could not be prepared.')
          }
          registerRenderedEnhancementSource(result.path)
          resolve(result.path)
        } catch (error) { reject(error) }
      })
    })
    previews.set(key, pending)
    void pending.catch(() => { if (previews.get(key) === pending) previews.delete(key) })
  }
  const rendered = await pending
  if (revision !== takePlaybackEnhancerRevision()) throw new DOMException('Enhancement settings changed.', 'AbortError')
  return rendered
}

const mediaSources = new WeakMap<HTMLMediaElement, { original: string; rendered: string }>()
export async function prepareNaturalMediaPreview(media: HTMLMediaElement): Promise<void> {
  const revision = takePlaybackEnhancerRevision()
  const wasConnected = media.isConnected
  const current = media.getAttribute('src') || media.currentSrc
  if (!current) return
  const previous = mediaSources.get(media)
  const original = previous && current === previous.rendered ? previous.original : current
  const renderedPath = await prepareNaturalTakePreview(original, media instanceof HTMLVideoElement ? 'video' : 'audio')
  const rendered = renderedPath.startsWith('file://') ? Capacitor.convertFileSrc(renderedPath) : renderedPath
  // Source may have been replaced by another take during the render.
  if ((media.getAttribute('src') || media.currentSrc) !== current || (wasConnected && !media.isConnected) || revision !== takePlaybackEnhancerRevision()) {
    throw new DOMException('Playback preparation was cancelled.', 'AbortError')
  }
  mediaSources.set(media, { original, rendered })
  if (rendered !== current) {
    const time = media.currentTime
    media.src = rendered
    media.load()
    if (time > 0) media.currentTime = time
  }
}
