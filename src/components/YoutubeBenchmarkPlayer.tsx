import { useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { normalizeYoutubeEmbedUrl } from '../utils/youtubeEmbed'
import {
  pauseYoutubeProxy,
  scheduleYoutubeReferenceWake,
  wakeYoutubeReference,
} from '../utils/playalong/youtubeBridge'

interface YoutubeBenchmarkPlayerProps {
  autoPlayOnLoad?: boolean
  embedUrl: string
  hostEl: HTMLElement | null
  iframeRef: RefObject<HTMLIFrameElement | null>
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Single persistent YouTube iframe — portaled into the active Best Take host so it survives split/pip toggles. */
export default function YoutubeBenchmarkPlayer({
  embedUrl,
  autoPlayOnLoad = true,
  hostEl,
  iframeRef,
}: YoutubeBenchmarkPlayerProps) {
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [fallbackEl, setFallbackEl] = useState<HTMLDivElement | null>(null)

  const portalTarget = hostEl ?? fallbackEl
  const normalizedUrl = normalizeYoutubeEmbedUrl(embedUrl)
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

  // Offline, the iframe would show the browser's own error page in the card.
  // Say what is wrong instead; the video loads again once the connection returns.
  const iframe = !online ? (
    <div
      className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-white/75"
      role="status"
    >
      This YouTube reference needs an internet connection. It will load when you are back online.
    </div>
  ) : (
    <iframe
      key={normalizedUrl}
      ref={iframeRef}
      src={normalizedUrl}
      className="youtube-embed-iframe h-full w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowFullScreen
      title="YouTube reference"
      onLoad={() => {
        const el = iframeRef.current
        if (!autoPlayOnLoad) {
          pauseYoutubeProxy(el)
          return
        }
        wakeYoutubeReference(el)
        scheduleYoutubeReferenceWake(el)
      }}
    />
  )

  return (
    <>
      <div
        ref={(el) => {
          fallbackRef.current = el
          setFallbackEl(el)
        }}
        className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
        aria-hidden
      />
      {portalTarget ? createPortal(iframe, portalTarget) : null}
    </>
  )
}
