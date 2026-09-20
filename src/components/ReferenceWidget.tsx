import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { GripHorizontal, Minus, Play, X } from 'lucide-react'
import BestTakeBox from './BestTakeBox'
import type { LibraryPlaybackReference } from '../types/library'
import { clampWidgetPosition } from '../utils/floatingWidgetLayout'

export default function ReferenceWidget({ boundaryRef, expanded, onExpandedChange, onClose, showTrackName = false, visible = true, youtubeUrl, libraryPlayback,
  suspended, onSubmitYoutube, onUpload, onClearAudio, onClearYoutube, onYoutubeHostChange, youtubeIframeRef, onPlaybackChange, onBeforePlay,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  onClose?: () => void
  showTrackName?: boolean
  visible?: boolean
  youtubeUrl: string | null
  libraryPlayback: LibraryPlaybackReference | null
  suspended: boolean
  onSubmitYoutube: (url: string) => void
  onUpload: (file: File) => void
  onClearAudio: () => void
  onClearYoutube: () => void
  onYoutubeHostChange: (host: HTMLDivElement | null) => void
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
  onPlaybackChange: (playing: boolean) => void
  onBeforePlay: () => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const x = useMotionValue(16)
  const y = useMotionValue(112)
  useEffect(() => {
    if (suspended) onPlaybackChange(false)
  }, [suspended, onPlaybackChange])
  useLayoutEffect(() => {
    const bounds = boundaryRef.current, widget = node.current
    if (!bounds || !widget) return
    const fit = () => { const p = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight, widget.offsetWidth, widget.offsetHeight, x.get(), y.get()); x.set(p.x); y.set(p.y) }
    const observer = new ResizeObserver(fit);observer.observe(bounds);observer.observe(widget);fit()
    return () => observer.disconnect()
  }, [boundaryRef, x, y])
  return <motion.div ref={node} className={`reference-widget-live ${expanded ? 'is-expanded' : ''}`}
    style={{ display: visible ? undefined : 'none', x, y }} drag dragControls={drag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={boundaryRef}>
    {!expanded && <button className="reference-widget-chip" onClick={() => onExpandedChange(true)} aria-label="Open References"><Play aria-hidden />References</button>}
    <div className={`reference-widget-panel ${showTrackName && libraryPlayback ? 'reference-widget-panel--named-audio' : ''}`} hidden={!expanded}>
      <header onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) drag.start(e) }}>
        <span><GripHorizontal aria-hidden />References</span><button onClick={() => onExpandedChange(false)} aria-label="Collapse References"><Minus aria-hidden /></button>{onClose && <button onClick={onClose} aria-label="Close References"><X aria-hidden /></button>}
      </header>
      {showTrackName && libraryPlayback && <p className="reference-widget-track-name">{libraryPlayback.name}</p>}
      <div className="reference-widget-media">
        <BestTakeBox layout={youtubeUrl ? 'pip' : 'fill'} take={null} playbackOwner="reference-widget" displayLabel="" uploadAccept="audio/*,.mp3,.m4a,.wav" youtubeEmbedUrl={youtubeUrl} libraryPlayback={libraryPlayback}
          suspendPlayback={suspended || !expanded} onBeforePlay={onBeforePlay} onUnpinTake={onClearAudio} onClearLibraryReference={onClearAudio}
          onClearYoutube={onClearYoutube} onSubmitYoutube={onSubmitYoutube} onUpload={onUpload}
          onYoutubeHostChange={onYoutubeHostChange} youtubeIframeRef={youtubeIframeRef} onPlaybackChange={onPlaybackChange} />
      </div>
    </div>
  </motion.div>
}
