/**
 * Rests, drawn rather than set from a font.
 *
 * The Musical Symbols rest codepoints are missing from every music font this
 * game can fall back to — they measure identically to an unassigned codepoint,
 * which means a tofu box on the staff — so they are drawn here for the same
 * reason the eighth-note flag is: a rest has to be a rest everywhere.
 *
 * Geometry is in staff spaces with the origin on the middle line and y pointing
 * down, so the shapes are written the way an engraver describes them: the half
 * rest sits on the middle line, the whole rest hangs under the line above it,
 * and the flagged rests straddle the middle.
 */
import { STAFF_SPACE_PX } from './staffNotationMap'
import type { NoteValue } from './staffJumperRhythm'

/** Drawing box around the anchor, in staff spaces. Wide enough for any rest. */
const BOX_W_SPACES = 2.4
const BOX_H_SPACES = 4

/** Stroke weights, in staff spaces. */
const ZIGZAG_STROKE = 0.3
const ZIGZAG_HOOK_STROKE = 0.19
const FLAG_STROKE = 0.12

/** Where a flag's ball sits relative to the point it leaves the stem. */
const BALL_DX = -0.56
const BALL_DY = 0.18
const BALL_R = 0.21

/** A bar-length rest is a solid block half a space deep. */
function BlockRest({ topSpaces }: { topSpaces: number }) {
  return <rect x={-0.565} y={topSpaces} width={1.13} height={0.5} strokeWidth={0} />
}

/**
 * The quarter rest's zigzag and its terminal hook.
 *
 * Two strokes rather than one because the diagonals are heavy and the hook that
 * closes them is light — that weight contrast is most of what makes the shape
 * readable at the size a phone renders it.
 */
function QuarterRest() {
  return (
    <>
      <path
        d="M -0.30 -1.38 L 0.32 -0.60 L -0.26 0.00 L 0.34 0.74"
        fill="none"
        strokeWidth={ZIGZAG_STROKE}
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
      <path
        d="M 0.34 0.74 C 0.02 0.56 -0.36 0.78 -0.30 1.14 C -0.26 1.40 0.06 1.44 0.24 1.28"
        fill="none"
        strokeWidth={ZIGZAG_HOOK_STROKE}
        strokeLinecap="round"
      />
    </>
  )
}

/**
 * A flagged rest: one slanting stem carrying a hooked ball per flag.
 *
 * An eighth rest has one and a sixteenth has two, the same relationship a
 * flagged note has — which is what lets the value be read at a glance. The
 * second flag leaves the stem well down its length so the two balls stay
 * separate rather than merging into a blob.
 */
function FlaggedRest({ sixteenth }: { sixteenth: boolean }) {
  const top = sixteenth ? { x: 0.34, y: -1.25 } : { x: 0.32, y: -0.82 }
  const foot = sixteenth ? { x: -0.26, y: 1.3 } : { x: -0.26, y: 0.86 }
  const flagStarts = sixteenth ? [0, 0.4] : [0]

  return (
    <>
      <path
        d={`M ${top.x} ${top.y} L ${foot.x} ${foot.y}`}
        fill="none"
        strokeWidth={FLAG_STROKE}
        strokeLinecap="round"
      />
      {flagStarts.map((t) => {
        const ax = top.x + (foot.x - top.x) * t
        const ay = top.y + (foot.y - top.y) * t
        const bx = ax + BALL_DX
        const by = ay + BALL_DY
        return (
          <g key={t}>
            <path
              d={`M ${ax} ${ay} C ${ax - 0.1} ${ay + 0.3} ${bx + 0.3} ${by + 0.24} ${bx + 0.12} ${
                by + 0.06
              }`}
              fill="none"
              strokeWidth={FLAG_STROKE}
              strokeLinecap="round"
            />
            <circle cx={bx} cy={by} r={BALL_R} strokeWidth={0} />
          </g>
        )
      })}
    </>
  )
}

interface StaffRestProps {
  value: NoteValue
  opacity?: number
}

/**
 * One rest, drawn inside a `.sj-note` anchor.
 *
 * That anchor is a zero-size point at the slot's staff position, which for a
 * rest is always the middle line — so the box is simply centred on it and the
 * shapes place themselves from there.
 *
 * `strokeWidth={0}` on the root matters: SVG's default stroke width is one user
 * unit, and a user unit here is a whole staff space, so anything that forgets to
 * name its own weight would come out as a blot rather than a rest.
 */
export default function StaffRest({ value, opacity }: StaffRestProps) {
  const width = BOX_W_SPACES * STAFF_SPACE_PX
  const height = BOX_H_SPACES * STAFF_SPACE_PX

  return (
    <svg
      className="sj-rest"
      width={width}
      height={height}
      viewBox={`${-BOX_W_SPACES / 2} ${-BOX_H_SPACES / 2} ${BOX_W_SPACES} ${BOX_H_SPACES}`}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0}
      style={{
        position: 'absolute',
        left: `${-width / 2}px`,
        top: `${-height / 2}px`,
        overflow: 'visible',
        opacity,
      }}
      aria-hidden
      focusable="false"
    >
      {value === 'whole' && <BlockRest topSpaces={-1} />}
      {value === 'half' && <BlockRest topSpaces={-0.5} />}
      {value === 'quarter' && <QuarterRest />}
      {value === 'eighth' && <FlaggedRest sixteenth={false} />}
      {value === 'sixteenth' && <FlaggedRest sixteenth />}
    </svg>
  )
}
