import { useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface YoutubeBenchmarkPlayerProps {
  embedUrl: string
  hostEl: HTMLElement | null
  iframeRef: RefObject<HTMLIFrameElement | null>
}

/** Single persistent YouTube iframe — portaled into the active Best Take host so it survives split/pip toggles. */
export default function YoutubeBenchmarkPlayer({
  embedUrl,
  hostEl,
  iframeRef,
}: YoutubeBenchmarkPlayerProps) {
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [fallbackEl, setFallbackEl] = useState<HTMLDivElement | null>(null)

  const portalTarget = hostEl ?? fallbackEl

  const iframe = (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      className="youtube-embed-iframe h-full w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      title="YouTube reference"
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
