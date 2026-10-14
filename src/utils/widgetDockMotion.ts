/** A completed fold lets the Music rail acknowledge the arriving tool. */
export const MUSIC_DOCK_ARRIVAL_EVENT = 'besttake:music-widget-dock-arrival'
export type MusicDockArrivalDetail = { id: string }
export type WidgetFoldSource = { rect: DOMRect; transform: string; opacity: string }

/** Animate the mounted, inert owner rather than creating a second interactive panel. */
export function animateWidgetDockArrival(
  widget: HTMLElement, target: HTMLElement | null, source: WidgetFoldSource,
  id: string, reducedMotion: boolean, docked: boolean,
): (() => void) | undefined {
  const arrive = () => {
    if (docked) window.dispatchEvent(new CustomEvent<MusicDockArrivalDetail>(MUSIC_DOCK_ARRIVAL_EVENT, { detail: { id } }))
  }
  const destination = target?.getBoundingClientRect()
  if (reducedMotion || !widget.animate || !destination || !destination.width || !destination.height ||
      !source.rect.width || !source.rect.height || target?.getClientRects().length === 0) {
    arrive()
    return
  }
  const parent = widget.offsetParent as HTMLElement | null
  const parentRect = parent?.getBoundingClientRect()
  const scaleX = parent && parentRect?.width ? parentRect.width / Math.max(1, parent.clientWidth) : 1
  const scaleY = parent && parentRect?.height ? parentRect.height / Math.max(1, parent.clientHeight) : 1
  const dx = (destination.left + destination.width / 2 - source.rect.left - source.rect.width / 2) / scaleX
  const dy = (destination.top + destination.height / 2 - source.rect.top - source.rect.height / 2) / scaleY
  const scale = Math.max(.06, Math.min(.3, destination.width / source.rect.width, destination.height / source.rect.height))
  const baseTransform = source.transform === 'none' ? '' : source.transform
  widget.dataset.widgetFolding = 'true'
  const animation = widget.animate([
    { transform: baseTransform || 'none', transformOrigin: '50% 50%', opacity: source.opacity },
    { transform: `translate(${dx * .88}px, ${dy * .88}px) ${baseTransform} scale(${Math.max(scale, .16)})`, transformOrigin: '50% 50%', opacity: .7, offset: .8 },
    { transform: `translate(${dx}px, ${dy}px) ${baseTransform} scale(${scale})`, transformOrigin: '50% 50%', opacity: 0 },
  ], { duration: 360, easing: 'cubic-bezier(.2,0,.2,1)', fill: 'both' })
  animation.onfinish = () => {
    delete widget.dataset.widgetFolding
    animation.cancel()
    arrive()
  }
  return () => {
    animation.onfinish = null
    delete widget.dataset.widgetFolding
    animation.cancel()
  }
}
