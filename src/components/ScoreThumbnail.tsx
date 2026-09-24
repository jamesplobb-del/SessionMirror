import { useEffect, useRef, useState } from 'react'
import { FileMusic } from 'lucide-react'
import { loadPracticeChart } from '../utils/practiceChartStorage'
import type { ChartDocument } from './practiceChart/chartDocument'

// Large libraries must not start a PDF worker for every visible row at once.
let thumbnailQueue: Promise<void> = Promise.resolve()

/** Shared first-page preview for a score in Music and in a routine. */
export default function ScoreThumbnail({ projectId, revision }: { projectId: string | null; revision: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState('')
  const [rendered, setRendered] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let pdf: ChartDocument | undefined
    setImage(''); setRendered(false)
    if (projectId) thumbnailQueue = thumbnailQueue.then(async () => {
      if (controller.signal.aborted) return
      const chart = await loadPracticeChart(projectId)
      if (!chart || controller.signal.aborted) return
      if (!chart.bytes) { setImage(chart.objectUrl); return }
      const { openPdfChart } = await import('./practiceChart/chartDocument')
      if (controller.signal.aborted) return
      pdf = await openPdfChart(chart.bytes)
      try {
        if (!controller.signal.aborted && canvas.current) {
          await pdf.renderPage(0, canvas.current, 70, controller.signal)
          if (!controller.signal.aborted) setRendered(true)
        }
      } finally { pdf.destroy() }
    }).catch(() => { /* Keep the file icon if a preview cannot be rendered. */ })
    return () => { controller.abort(); pdf?.destroy() }
  }, [projectId, revision])
  return <span className="music-routine-thumb" aria-hidden>
    {!rendered && !image && <FileMusic />}
    <canvas ref={canvas} hidden={!rendered} />
    {image && <img src={image} alt="" />}
  </span>
}
