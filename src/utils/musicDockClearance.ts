/** Keep expanded Music panels clear of the rail and its reachable disclosure handle. */
export function musicDockClearX(desiredX: number, panelWidth: number, boundaryLeft = 0): number {
  if (typeof document === 'undefined') return desiredX
  const drawer = document.querySelector<HTMLElement>('.app-shell--music-page .music-widget-drawer')
  if (!drawer?.getClientRects().length) return desiredX
  const handle = drawer.querySelector<HTMLElement>('.music-widget-drawer__handle')
  const drawerLeft = drawer.getBoundingClientRect().left
  // The handle protrudes into the score even when the rail body is folded away.
  const handleLeft = handle?.getClientRects().length ? handle.getBoundingClientRect().left : drawerLeft
  return Math.min(desiredX, Math.min(drawerLeft, handleLeft) - boundaryLeft - panelWidth - 12)
}
