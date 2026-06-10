export const PHYSICAL_UI_ROOT_ID = 'physical-ui-root'

export function readPhysicalUiPortal(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('document is unavailable')
  }
  return document.getElementById(PHYSICAL_UI_ROOT_ID) ?? document.body
}
