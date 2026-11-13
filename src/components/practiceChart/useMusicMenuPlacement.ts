import { useLayoutEffect, useState, type RefObject } from 'react'

/** Keep score menus under their trigger and inside the visible reading area. */
export function useMusicMenuPlacement(
  boundaryRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  menuAnchor: HTMLElement | null,
  open: boolean,
) {
  const [placement, setPlacement] = useState({ left: 12, top: 72, maxHeight: 500, maxWidth: 292, origin: 'top right' })

  useLayoutEffect(() => {
    if (!open) return
    const bounds = boundaryRef.current
    const menu = menuRef.current
    if (!bounds || !menu) return
    const place = () => {
      const box = bounds.getBoundingClientRect()
      const anchor = menuAnchor?.isConnected ? menuAnchor.getBoundingClientRect() : null
      const scaleX = box.width / Math.max(1, bounds.clientWidth)
      const scaleY = box.height / Math.max(1, bounds.clientHeight)
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
      const topEdge = Math.max(12, (viewportTop - box.top + 12) / scaleY)
      const bottomEdge = Math.min(bounds.clientHeight - 12, (viewportBottom - box.top - 12) / scaleY)
      const below = anchor ? (anchor.bottom - box.top) / scaleY + 8 : topEdge + 60
      const above = anchor ? (anchor.top - box.top) / scaleY - 8 : topEdge
      const availableBelow = bottomEdge - below
      const aboveAnchor = availableBelow < Math.min(menu.scrollHeight, 220) && above - topEdge > availableBelow
      const maxHeight = Math.max(1, Math.min(bottomEdge - topEdge, aboveAnchor ? above - topEdge : bottomEdge - Math.max(topEdge, below)))
      const height = Math.min(menu.scrollHeight, maxHeight)
      const viewportRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)
      const rightEdge = Math.min(bounds.clientWidth - 12, (viewportRight - box.left - 12) / scaleX)
      const leftEdge = Math.max(12, ((viewport?.offsetLeft ?? 0) - box.left + 12) / scaleX)
      const desiredLeft = anchor ? (anchor.right - box.left) / scaleX - menu.offsetWidth : rightEdge - menu.offsetWidth
      const next = {
        left: Math.max(leftEdge, Math.min(rightEdge - menu.offsetWidth, desiredLeft)),
        top: Math.max(topEdge, Math.min(bottomEdge - height, aboveAnchor ? above - height : below)),
        maxHeight, maxWidth: Math.max(1, rightEdge - leftEdge), origin: aboveAnchor ? 'bottom right' : 'top right',
      }
      setPlacement(previous => Object.entries(next).every(([key, value]) => previous[key as keyof typeof previous] === value) ? previous : next)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(bounds)
    observer.observe(menu)
    if (menuAnchor) observer.observe(menuAnchor)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [boundaryRef, menuAnchor, menuRef, open])

  return placement
}
