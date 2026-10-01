/**
 * A routine as a link, for places that can't open a .btplan file.
 *
 * Messages shows a custom file as an attachment it can't preview and offers no
 * way to open it, but it makes links tappable. The routine rides in the link's
 * fragment (after `#`), which browsers never send to a server, so the web page
 * only hands it on to the app: nothing is uploaded or stored.
 *
 *   https://…/r.html#v1.<data>   what gets sent; opens a page with "Open in BestTake"
 *   besttake://routine#v1.<data> what that page opens; handled in routineFileOpen
 *
 * <data> is the .btplan JSON, deflate-compressed and base64url-encoded.
 */

export const ROUTINE_WEB_LINK_BASE = 'https://besttake-share.netlify.app/'
export const ROUTINE_APP_LINK_PREFIX = 'besttake://routine'
const VERSION = 'v1.'
/** Keeps links comfortably inside what Messages and Safari handle. */
export const MAX_ROUTINE_LINK_LENGTH = 60_000

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

/** The shareable web link for a .btplan file's JSON, or null if it's too big for a link. */
export async function buildRoutineLink(json: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null
  const packed = toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))
  const link = `${ROUTINE_WEB_LINK_BASE}#${VERSION}${packed}`
  return link.length <= MAX_ROUTINE_LINK_LENGTH ? link : null
}

/** The .btplan JSON inside a routine link (web or app form), or null if it's damaged. */
export async function decodeRoutineLink(url: string): Promise<string | null> {
  const fragment = url.split('#')[1] ?? ''
  if (!fragment.startsWith(VERSION) || typeof DecompressionStream === 'undefined') return null
  try {
    const bytes = await pipe(fromBase64Url(fragment.slice(VERSION.length)), new DecompressionStream('deflate-raw'))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
