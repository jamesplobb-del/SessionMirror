import { useEffect, useState } from 'react'
import {
  layoutMusicGlyph,
  measureMusicGlyphs,
  MUSIC_GLYPH_CHARS,
  MUSIC_GLYPH_FONT_FAMILY,
  type GlyphInkMetrics,
  type MusicGlyphName,
} from './staffGlyphMetrics'

/**
 * Ink metrics, re-measured once webfonts settle so the first paint is not stuck
 * with fallback proportions.
 */
export function useMusicGlyphMetrics(): Record<MusicGlyphName, GlyphInkMetrics> {
  const [metrics, setMetrics] = useState(measureMusicGlyphs)

  useEffect(() => {
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) setMetrics(measureMusicGlyphs())
    })
    return () => {
      cancelled = true
    }
  }, [])

  return metrics
}

interface StaffGlyphProps {
  name: MusicGlyphName
  /** Staff space size in world px — the glyph scales off this. */
  spacePx: number
  /** World Y of the staff position the glyph sits on. */
  staffY: number
  /** World X of the glyph edge named by `align`. */
  x: number
  align?: 'left' | 'right'
  metrics: Record<MusicGlyphName, GlyphInkMetrics>
  className?: string
}

/**
 * One music glyph, drawn in an SVG box that is exactly its ink box so that
 * `staffY` lands on the line or space the symbol belongs to, with no
 * font-dependent line-box padding in the way.
 */
export default function StaffGlyph({
  name,
  spacePx,
  staffY,
  x,
  align = 'left',
  metrics,
  className,
}: StaffGlyphProps) {
  const layout = layoutMusicGlyph(name, spacePx, metrics)

  return (
    <svg
      className={className}
      width={layout.width}
      height={layout.height}
      // viewBox stays at the natural ink width so a width-normalized glyph is
      // squeezed to the engraved proportion rather than clipped.
      viewBox={`0 0 ${layout.naturalWidth} ${layout.height}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        left: `${align === 'right' ? x - layout.width : x}px`,
        top: `${staffY - layout.anchorOffsetY}px`,
        overflow: 'visible',
      }}
      aria-hidden
      focusable="false"
    >
      <text
        x={layout.drawX}
        y={layout.baselineY}
        fontSize={layout.fontSize}
        fontFamily={MUSIC_GLYPH_FONT_FAMILY}
        fill="currentColor"
      >
        {MUSIC_GLYPH_CHARS[name]}
      </text>
    </svg>
  )
}

/** World width of a glyph — used to reserve horizontal space before drawing. */
export function staffGlyphWidth(
  name: MusicGlyphName,
  spacePx: number,
  metrics: Record<MusicGlyphName, GlyphInkMetrics>,
): number {
  return layoutMusicGlyph(name, spacePx, metrics).width
}
