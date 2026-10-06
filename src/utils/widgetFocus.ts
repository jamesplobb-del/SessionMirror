/** Return to the visible Music rail handle when a launcher is in its closed dock. */
export function focusWidgetLauncher(launcher: HTMLButtonElement | null | undefined) {
  const closedDock = launcher?.closest<HTMLElement>('#music-widget-dock[inert]')
  const target = closedDock?.closest('.music-widget-drawer')
    ?.querySelector<HTMLButtonElement>('.music-widget-drawer__handle') ?? launcher
  target?.focus({ preventScroll: true })
}
