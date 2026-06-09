/** Keeps iOS WKWebView viewport CSS variables in sync after resize / rotation. */
export function syncViewportMetrics(): { width: number; height: number; cover: number } {
  const vv = window.visualViewport
  const width = Math.round(vv?.width ?? window.innerWidth)
  const height = Math.round(vv?.height ?? window.innerHeight)
  const cover = Math.ceil(Math.max(width, height) * 1.04)

  const root = document.documentElement
  root.style.setProperty('--viewport-width', `${width}px`)
  root.style.setProperty('--viewport-height', `${height}px`)
  root.style.setProperty('--viewport-cover', `${cover}px`)
  root.style.setProperty('--app-height', `${height}px`)

  document.body.style.width = `${width}px`
  document.body.style.height = `${height}px`

  // Force WebKit to recalculate layout after orientation changes.
  void document.body.offsetHeight

  return { width, height, cover }
}

export function applyCameraPreviewCoverSize(video: HTMLVideoElement | null): void {
  if (!video) return
  const { cover } = syncViewportMetrics()
  video.style.width = `${cover}px`
  video.style.height = `${cover}px`
}
