/** Keep a panel opened from the Music drawer clear of the collapsed tools. */
export function musicDockClearX(desiredX: number, panelWidth: number, boundaryLeft = 0): number {
  const drawer = document.querySelector<HTMLElement>(
    '.app-shell--music-page:not(.app-shell--music-dock-closed) .music-widget-drawer',
  )
  if (!drawer) return desiredX
  return Math.min(desiredX, drawer.getBoundingClientRect().left - boundaryLeft - panelWidth - 12)
}
