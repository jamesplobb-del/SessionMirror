const YOUTUBE_PROXY_ORIGIN = 'https://singular-manatee-b52df8.netlify.app'

/** Build the Capacitor-safe proxy iframe URL for a YouTube video ID. */
export function buildYoutubeProxyUrl(videoId: string): string {
  const params = new URLSearchParams({
    v: videoId,
    controls: '1',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
  })
  return `${YOUTUBE_PROXY_ORIGIN}/?${params.toString()}`
}

/** Extract a YouTube video ID from a pasted URL or raw ID. */
export function parseYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'singular-manatee-b52df8.netlify.app') {
      const fromQuery = url.searchParams.get('v')
      return fromQuery && /^[\w-]{11}$/.test(fromQuery) ? fromQuery : null
    }

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const fromQuery = url.searchParams.get('v')
      if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery

      const parts = url.pathname.split('/').filter(Boolean)
      const embedIdx = parts.indexOf('embed')
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        const id = parts[embedIdx + 1]
        return /^[\w-]{11}$/.test(id) ? id : null
      }

      const shortsIdx = parts.indexOf('shorts')
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
        const id = parts[shortsIdx + 1]
        return /^[\w-]{11}$/.test(id) ? id : null
      }
    }
  } catch {
    return null
  }

  return null
}

/** Parse a pasted YouTube URL or video ID into the proxy iframe URL. */
export function parseYoutubeEmbedUrl(input: string): string | null {
  const videoId = parseYoutubeVideoId(input)
  return videoId ? buildYoutubeProxyUrl(videoId) : null
}
