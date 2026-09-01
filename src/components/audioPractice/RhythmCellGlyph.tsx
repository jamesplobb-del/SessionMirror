import type { RhythmCellNotation } from '../../metronome/metronomeNotation'

const HEAD_RX = 3.6
const HEAD_RY = 2.6
const HEAD_Y = 26
const STEM_TOP = 9
const STEM_X_OFFSET = HEAD_RX - 0.5
const STEP = 9.6
const BEAM_H = 2.4
const BEAM_GAP = 1.2
const DOT_R = 1.1
const VIEW_H = 34
const PAD = 2.4

/**
 * One conducting beat drawn as notation — the beat itself, or the beat filled
 * with its subdivision.
 *
 * Drawn rather than typed: the Unicode note glyphs (♩ ♪ ♫ ♬) have no dotted
 * values, no tuplet numbers and no single sixteenth, and the Musical Symbols
 * block that does (𝅗𝅥, 𝅘𝅥𝅯) is not covered by the iOS system fonts. Six shapes
 * in SVG cover every meter the app offers and inherit `currentColor`, so the
 * cell themes itself.
 */
export default function RhythmCellGlyph({
  notation,
  height = 22,
  className = '',
  title,
}: {
  notation: RhythmCellNotation
  /** Rendered height in px. Width follows the note count. */
  height?: number
  className?: string
  /** Accessible name. Omit to render decoratively alongside real text. */
  title?: string
}) {
  const { count, beams, dotted, hollow, stemless, tuplet } = notation

  const headXs = Array.from({ length: count }, (_, index) => PAD + HEAD_RX + index * STEP)
  const lastHeadX = headXs[headXs.length - 1]
  const dotWidth = dotted ? DOT_R * 2 + 2.2 : 0
  const width = lastHeadX + HEAD_RX + dotWidth + PAD

  const stemXs = headXs.map((x) => x + STEM_X_OFFSET)
  const beamed = count > 1 && beams > 0

  // Only a tuplet needs the headroom above the stems. Cropping it otherwise
  // lets a plain note fill the height it is given instead of floating small in
  // reserved space — the dot on a dotted quarter is a single pixel at 15px if
  // a third of the box is empty.
  const top = tuplet ? 0 : STEM_TOP - 2
  const viewHeight = VIEW_H - top

  return (
    <svg
      className={`rhythm-cell-glyph ${className}`}
      viewBox={`0 ${top} ${width.toFixed(2)} ${viewHeight}`}
      height={height}
      width={(width / viewHeight) * height}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {headXs.map((headX, index) => (
        <g key={index}>
          <ellipse
            cx={headX}
            cy={HEAD_Y}
            rx={HEAD_RX}
            ry={HEAD_RY}
            transform={`rotate(-18 ${headX} ${HEAD_Y})`}
            fill={hollow ? 'none' : 'currentColor'}
            stroke="currentColor"
            strokeWidth={hollow ? 1.3 : 0}
          />
          {dotted ? (
            <circle cx={headX + HEAD_RX + 2.4} cy={HEAD_Y - 1.7} r={DOT_R} fill="currentColor" />
          ) : null}
          {stemless ? null : (
            <line
              x1={stemXs[index]}
              y1={HEAD_Y - 0.6}
              x2={stemXs[index]}
              y2={STEM_TOP}
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          )}
        </g>
      ))}

      {/* Beams join the group; a lone flagged note gets flags instead. */}
      {beamed
        ? Array.from({ length: beams }, (_, beamIndex) => (
            <rect
              key={`beam-${beamIndex}`}
              x={stemXs[0] - 0.65}
              y={STEM_TOP + beamIndex * (BEAM_H + BEAM_GAP)}
              width={stemXs[stemXs.length - 1] - stemXs[0] + 1.3}
              height={BEAM_H}
              rx={0.5}
              fill="currentColor"
            />
          ))
        : null}

      {!beamed && !stemless && beams > 0
        ? Array.from({ length: beams }, (_, flagIndex) => {
            const y = STEM_TOP + flagIndex * (BEAM_H + BEAM_GAP + 1)
            return (
              <path
                key={`flag-${flagIndex}`}
                d={`M${stemXs[0]},${y} c 4.4,1.5 5.8,4.4 3.6,7.9 c 0.9,-3.7 -0.7,-5.4 -3.6,-6.4 z`}
                fill="currentColor"
              />
            )
          })
        : null}

      {tuplet ? (
        <TupletMark
          left={stemXs[0]}
          right={stemXs[stemXs.length - 1]}
          count={tuplet}
          // A beamed group already reads as one unit, so engraving convention
          // drops the bracket and leaves the number over the beam.
          bracketed={beams === 0}
        />
      ) : null}
    </svg>
  )
}

const BRACKET_Y = 4.2
const BRACKET_GAP = 4.6

function TupletMark({
  left,
  right,
  count,
  bracketed,
}: {
  left: number
  right: number
  count: number
  bracketed: boolean
}) {
  const middle = (left + right) / 2
  return (
    <>
      {bracketed ? (
        <path
          d={
            `M${left - 0.6},${BRACKET_Y + 2.4} V${BRACKET_Y} H${middle - BRACKET_GAP} ` +
            `M${right + 0.6},${BRACKET_Y + 2.4} V${BRACKET_Y} H${middle + BRACKET_GAP}`
          }
          stroke="currentColor"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      ) : null}
      <text
        x={middle}
        y={BRACKET_Y + 3}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={700}
        fill="currentColor"
      >
        {count}
      </text>
    </>
  )
}
