import { useId } from 'react'
import type { Instrument, LessonNote } from './instrumentData'

export interface FingeringChartProps {
  instrument: Instrument
  note: LessonNote
}

/*
 * Fingering charts drawn the way they are printed.
 *
 * The six main finger positions stay visible on every note. Auxiliary keys are
 * contextual: the chart shows the key a student must press plus the few keys
 * immediately around it, just like a beginner method-book chart. That keeps a
 * pinky/palm cluster identifiable without turning every note into a drawing of
 * the entire mechanism. Filled means down, hollow means up.
 */

type MarkState = 'closed' | 'open' | 'half'

const STROKE = 4.5
const SMALL_STROKE = 3.4

function stateOf(id: string, closed: ReadonlySet<string>, half: ReadonlySet<string>): MarkState {
  if (half.has(id)) return 'half'
  return closed.has(id) ? 'closed' : 'open'
}

function hasAny(set: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.some((id) => set.has(id))
}

/* ── Shape kit ────────────────────────────────────────────────────────── */

interface KeyProps {
  state?: MarkState
  /** Names the key. Only the keys a lesson can actually ask for get one. */
  label?: string
  labelX?: number
  labelY?: number
  /** A soft patch behind a pressed key, so a small one still reads at a glance. */
  halo?: boolean
}

function Caption({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text className="li-chart__label" x={x} y={y} textAnchor="middle">
      {text}
    </text>
  )
}

function Halo({
  x,
  y,
  w,
  h,
  show,
}: {
  x: number
  y: number
  w: number
  h: number
  show?: boolean
}) {
  if (!show) return null
  return (
    <rect className="li-chart__halo" x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} />
  )
}

/** A tone hole or ring key — the large circle that carries every chart. */
function ToneHole({
  cx,
  cy,
  r = 18,
  state = 'open',
  label,
  labelX,
  labelY,
  halo,
}: KeyProps & { cx: number; cy: number; r?: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo
        x={cx - r - 8}
        y={cy - r - 8}
        w={(r + 8) * 2}
        h={(r + 8) * 2}
        show={halo && state !== 'open'}
      />
      <circle className="li-chart__hole" cx={cx} cy={cy} r={r} strokeWidth={STROKE} />
      {state === 'half' && (
        <path
          className="li-chart__half"
          d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`}
        />
      )}
      {label && <Caption x={labelX ?? cx} y={labelY ?? cy + r + 22} text={label} />}
    </g>
  )
}

/** A palm, trill or bis key: the small circle that sits off the main stack. */
function SmallHole({
  cx,
  cy,
  r = 9,
  state = 'open',
}: KeyProps & { cx: number; cy: number; r?: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <circle className="li-chart__hole" cx={cx} cy={cy} r={r} strokeWidth={SMALL_STROKE} />
    </g>
  )
}

/** The clarinet register key — a teardrop, point up, behind the thumb. */
function TeardropKey({
  x,
  y,
  state = 'open',
  label,
  labelY,
  halo,
}: KeyProps & { x: number; y: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo x={x - 16} y={y - 37} w={32} h={68} show={halo && state !== 'open'} />
      <path
        className="li-chart__key"
        strokeWidth={STROKE}
        d={`M ${x} ${y - 31}
            C ${x + 9} ${y - 11} ${x + 8} ${y + 14} ${x} ${y + 23}
            C ${x - 8} ${y + 14} ${x - 9} ${y - 11} ${x} ${y - 31} Z`}
      />
      {label && <Caption x={x} y={labelY ?? y + 46} text={label} />}
    </g>
  )
}

/** The saxophone octave key — the triangle every sax chart prints. */
function TriangleKey({
  x,
  y,
  state = 'open',
  label,
  labelY,
  halo,
}: KeyProps & { x: number; y: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo x={x - 31} y={y - 29} w={62} h={54} show={halo && state !== 'open'} />
      <path
        className="li-chart__key"
        strokeWidth={STROKE}
        strokeLinejoin="round"
        d={`M ${x} ${y - 20} L ${x + 16} ${y + 16} L ${x - 16} ${y + 16} Z`}
      />
      {label && <Caption x={x} y={labelY ?? y + 40} text={label} />}
    </g>
  )
}

/** The asymmetric E♭ leaf and the two foot-joint rollers printed on flute charts. */
function FluteFootKeys({
  x,
  y,
  c,
  cSharp,
  eFlat,
}: {
  x: number
  y: number
  c: MarkState
  cSharp: MarkState
  eFlat: MarkState
}) {
  const showRollers = c !== 'open' || cSharp !== 'open'

  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={eFlat}>
        <ellipse
          className="li-chart__key"
          cx={x}
          cy={y}
          rx={10}
          ry={21}
          strokeWidth={STROKE}
          transform={`rotate(-10 ${x} ${y})`}
        />
      </g>

      {showRollers && (
        <g>
          {/* The supplied chart fixes this orientation: C is the upper roller,
              C♯ is the lower one. */}
          <g className="li-chart__mark" data-state={c}>
            <rect
              className="li-chart__key"
              x={x + 13}
              y={y - 12}
              width={36}
              height={12}
              rx={6}
              strokeWidth={SMALL_STROKE}
            />
          </g>
          <g className="li-chart__mark" data-state={cSharp}>
            <rect
              className="li-chart__key"
              x={x + 13}
              y={y + 2}
              width={36}
              height={12}
              rx={6}
              strokeWidth={SMALL_STROKE}
            />
          </g>
        </g>
      )}
    </g>
  )
}

/** B-natural thumb almond plus the neighbouring B♭ pearl, between two rails. */
function FluteThumbKeys({ thumb, thumbBFlat }: { thumb: MarkState; thumbBFlat: MarkState }) {
  return (
    <g aria-hidden>
      <line className="li-chart__mechanism" x1={78} x2={194} y1={140} y2={140} />
      <line className="li-chart__mechanism" x1={78} x2={194} y1={172} y2={172} />
      <ToneHole cx={101} cy={156} r={12} state={thumbBFlat} />
      <g className="li-chart__mark" data-state={thumb}>
        <ellipse
          className="li-chart__key"
          cx={145}
          cy={156}
          rx={39}
          ry={12}
          strokeWidth={SMALL_STROKE}
        />
      </g>
    </g>
  )
}

/** The small offset G♯ oval used by basic flute fingering charts. */
function FluteGSharpKey({ state }: { state: MarkState }) {
  return (
    <g className="li-chart__mark" data-state={state} aria-hidden>
      <ellipse
        className="li-chart__key"
        cx={207}
        cy={49}
        rx={9}
        ry={15}
        strokeWidth={SMALL_STROKE}
        transform="rotate(-16 207 49)"
      />
    </g>
  )
}

/** A small throat-key touchpiece, drawn like the compact method-book symbol. */
function ClarinetTopKey({
  x,
  y,
  state,
  shape,
}: {
  x: number
  y: number
  state: MarkState
  shape: 'oval' | 'leaf'
}) {
  return (
    <g className="li-chart__mark" data-state={state} aria-hidden>
      {shape === 'oval' ? (
        <ellipse className="li-chart__key" cx={x} cy={y} rx={7} ry={15} strokeWidth={SMALL_STROKE} />
      ) : (
        <ellipse
          className="li-chart__key"
          cx={x}
          cy={y}
          rx={8}
          ry={17}
          strokeWidth={SMALL_STROKE}
          transform={`rotate(-10 ${x} ${y})`}
        />
      )}
    </g>
  )
}

function ClarinetSpoon({
  x,
  y,
  state,
  angle = 0,
}: {
  x: number
  y: number
  state: MarkState
  angle?: number
}) {
  return (
    <g className="li-chart__mark" data-state={state} transform={`rotate(${angle} ${x} ${y})`}>
      <ellipse className="li-chart__key" cx={x} cy={y} rx={17} ry={7} strokeWidth={SMALL_STROKE} />
    </g>
  )
}

/** Four small pinky-key ovals in the familiar beginner-chart clover. */
function ClarinetFootCluster({
  x,
  y,
  states,
}: {
  x: number
  y: number
  states: {
    upperLeft: MarkState
    upperRight: MarkState
    lowerLeft: MarkState
    lowerRight: MarkState
  }
}) {
  const slots = [
    { id: 'upper-left', x: x - 18, y: y - 10, state: states.upperLeft, angle: -5 },
    { id: 'upper-right', x: x + 18, y: y - 10, state: states.upperRight, angle: 5 },
    { id: 'lower-left', x: x - 18, y: y + 12, state: states.lowerLeft, angle: 5 },
    { id: 'lower-right', x: x + 18, y: y + 12, state: states.lowerRight, angle: -5 },
  ].sort((a, b) => Number(a.state === 'closed') - Number(b.state === 'closed'))

  return (
    <g aria-hidden>
      {slots.map((slot) => (
        <ClarinetSpoon
          key={slot.id}
          x={slot.x}
          y={slot.y}
          state={slot.state}
          angle={slot.angle}
        />
      ))}
    </g>
  )
}

/** The separate four-key fan beside C♯4; it is not the lower pinky clover. */
function ClarinetCSharpFan({ state }: { state: MarkState }) {
  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={state}>
        <ellipse className="li-chart__key" cx={205} cy={266} rx={17} ry={6} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state="open" transform="rotate(-12 240 280)">
        <ellipse className="li-chart__key" cx={240} cy={280} rx={14} ry={5} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state="open" transform="rotate(-5 224 309)">
        <ellipse className="li-chart__key" cx={224} cy={309} rx={6} ry={20} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state="open" transform="rotate(6 247 310)">
        <ellipse className="li-chart__key" cx={247} cy={310} rx={6} ry={20} strokeWidth={SMALL_STROKE} />
      </g>
    </g>
  )
}

/** Four simple right-side key ovals, vertically staggered for orientation. */
function ClarinetSideFan({ states }: { states: readonly MarkState[] }) {
  const slots = [
    { cx: 238, cy: 258, rx: 14, ry: 5, angle: 3 },
    { cx: 247, cy: 278, rx: 12, ry: 5, angle: 12 },
    { cx: 251, cy: 306, rx: 6, ry: 17, angle: -4 },
    { cx: 271, cy: 321, rx: 6, ry: 17, angle: 5 },
  ]
  return (
    <g aria-hidden>
      {slots.map((slot, index) => (
        <g
          key={`${slot.cx}-${slot.cy}`}
          className="li-chart__mark"
          data-state={states[index] ?? 'open'}
          transform={`rotate(${slot.angle} ${slot.cx} ${slot.cy})`}
        >
          <ellipse
            className="li-chart__key"
            cx={slot.cx}
            cy={slot.cy}
            rx={slot.rx}
            ry={slot.ry}
            strokeWidth={SMALL_STROKE}
          />
        </g>
      ))}
    </g>
  )
}

/** The divided low-C/E♭ oval printed at the bottom of a saxophone chart. */
function SaxophoneLowKeys({
  x,
  y,
  lowC,
  lowEFlat,
}: {
  x: number
  y: number
  lowC: MarkState
  lowEFlat: MarkState
}) {
  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={lowEFlat}>
        <path
          className="li-chart__key"
          strokeWidth={SMALL_STROKE}
          d={`M ${x - 23} ${y} Q ${x} ${y - 18} ${x + 23} ${y} L ${x - 23} ${y} Z`}
        />
      </g>
      <g className="li-chart__mark" data-state={lowC}>
        <path
          className="li-chart__key"
          strokeWidth={SMALL_STROKE}
          d={`M ${x - 23} ${y} Q ${x} ${y + 18} ${x + 23} ${y} L ${x - 23} ${y} Z`}
        />
      </g>
    </g>
  )
}

/** The four-cell left-pinky table printed to the right of the sax stack. */
function SaxophoneLeftPinkyTable({
  states,
}: {
  states: {
    gSharp: MarkState
    b: MarkState
    cSharp: MarkState
    bFlat: MarkState
  }
}) {
  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={states.gSharp}>
        <rect className="li-chart__key" x={232} y={244} width={46} height={18} rx={2} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state={states.b}>
        <rect className="li-chart__key" x={232} y={264} width={22} height={18} rx={2} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state={states.cSharp}>
        <rect className="li-chart__key" x={256} y={264} width={22} height={18} rx={2} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state={states.bFlat}>
        <rect className="li-chart__key" x={232} y={284} width={46} height={18} rx={2} strokeWidth={SMALL_STROKE} />
      </g>
    </g>
  )
}

/** Narrow right-hand side-key ladder on the opposite side of the pinky table. */
function SaxophoneSideLadder({ states }: { states: readonly MarkState[] }) {
  return (
    <g aria-hidden>
      {states.map((state, index) => (
        <g key={index} className="li-chart__mark" data-state={state}>
          <rect
            className="li-chart__key"
            x={118 + (index === 1 ? 2 : 0)}
            y={304 + index * 19}
            width={8}
            height={17}
            rx={4}
            strokeWidth={2.6}
          />
        </g>
      ))}
    </g>
  )
}

/** The staggered high-F♯ touchpiece and its outlined location neighbour. */
function SaxophoneHighFSharpPair({ state }: { state: MarkState }) {
  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={state}>
        <ellipse className="li-chart__key" cx={132} cy={384} rx={6} ry={13} strokeWidth={SMALL_STROKE} />
      </g>
      <g className="li-chart__mark" data-state="open">
        <ellipse className="li-chart__key" cx={112} cy={402} rx={6} ry={13} strokeWidth={SMALL_STROKE} />
      </g>
    </g>
  )
}

/** Three long palm loops plus the small hollow neighbour in the reference chart. */
function SaxophonePalmFan({ states }: { states: readonly MarkState[] }) {
  const loops = [
    { id: 0, cx: 216, cy: 108 },
    { id: 1, cx: 233, cy: 126 },
    { id: 2, cx: 216, cy: 143 },
  ]
  return (
    <g aria-hidden>
      {loops.map(({ id, cx, cy }) => (
        <g key={id} className="li-chart__mark" data-state={states[id] ?? 'open'}>
          <ellipse className="li-chart__key" cx={cx} cy={cy} rx={5} ry={11} strokeWidth={2.7} />
        </g>
      ))}
    </g>
  )
}

/* ── Clarinet ─────────────────────────────────────────────────────────────
   Front of the instrument down the middle, the back thumb hole and register
   key on the left, throat keys upper right, and both pinky clusters where a
   printed chart puts them.
─────────────────────────────────────────────────────────────────────────── */

const CL = {
  column: 176,
  rail: 128,
  lh: [140, 194, 248],
  rh: [326, 380, 434],
  divider: 287,
} as const

const CL_SIDE_KEYS = ['side-1', 'side-2', 'side-3', 'side-4'] as const
const CL_FOOT_KEYS = ['lp-e', 'pinky-f', 'rp-fsharp', 'rp-ab'] as const

function ClarinetChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)
  const usesThroat = hasAny(closed, ['key-a', 'key-gsharp'])
  const usesSide = hasAny(closed, CL_SIDE_KEYS)
  const usesFootCluster = hasAny(closed, CL_FOOT_KEYS)

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 552" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__divider"
        x1={CL.column - 34}
        x2={CL.column + 34}
        y1={CL.divider}
        y2={CL.divider}
      />

      {/* Match the clean method-book silhouette: register above the thumb,
          thumb beside L1, and no mechanism lines competing with the holes. */}
      <TeardropKey x={CL.rail} y={75} state={st('octave')} />
      <ToneHole cx={CL.rail} cy={CL.lh[0]} r={15} state={st('thumb')} />

      {/* A and G♯ form one tight landmark pair in the supplied chart. */}
      {usesThroat && (
        <g>
          <ClarinetTopKey x={176} y={76} state={st('key-a')} shape="oval" />
          <ClarinetTopKey x={216} y={76} state={st('key-gsharp')} shape="leaf" />
        </g>
      )}

      {CL.lh.map((y, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={CL.column}
          cy={y}
          state={st(`lh-${index + 1}`)}
        />
      ))}

      {/* The side trill keys, drawn only on the notes that use one. */}
      {usesSide && <ClarinetSideFan states={CL_SIDE_KEYS.map((id) => st(id))} />}

      {closed.has('lp-csharp') && <ClarinetCSharpFan state={st('lp-csharp')} />}

      {CL.rh.map((y, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={CL.column}
          cy={y}
          state={st(`rh-${index + 1}`)}
        />
      ))}

      {usesFootCluster && (
        <ClarinetFootCluster
          x={172}
          y={492}
          states={{
            upperLeft: st('rp-ab'),
            upperRight: st('rp-fsharp'),
            lowerLeft: st('lp-e'),
            lowerRight: st('pinky-f'),
          }}
        />
      )}
    </svg>
  )
}

/* ── Saxophone ────────────────────────────────────────────────────────────
   Octave key on the left, palm keys above the left hand, side keys between
   the stacks, both pinky clusters below — the standard chart layout.
─────────────────────────────────────────────────────────────────────────── */

const SX = {
  column: 172,
  lh: [128, 182, 236],
  rh: [312, 366, 420],
  divider: 274,
} as const

const SX_PALM_KEYS = ['palm-d', 'palm-eb', 'palm-f'] as const
const SX_SIDE_KEYS = ['side-e', 'side-c', 'side-bb'] as const
const SX_LEFT_PINKY_KEYS = ['lp-gsharp', 'lp-csharp', 'lp-b', 'lp-bb'] as const

function SaxophoneChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)
  const usesPalm = hasAny(closed, SX_PALM_KEYS)
  const usesLeftPinky = hasAny(closed, SX_LEFT_PINKY_KEYS)
  const usesSide = hasAny(closed, SX_SIDE_KEYS)
  const usesLowKey = hasAny(closed, ['rp-c', 'rp-eb'])

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 516" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__divider"
        x1={SX.column - 34}
        x2={SX.column + 34}
        y1={SX.divider}
        y2={SX.divider}
      />

      {/* The octave landmark stays visible; smaller mechanisms appear only
          when that local group helps locate a pressed key. */}
      <TriangleKey x={112} y={174} state={st('octave')} />
      {closed.has('front-f') && <SmallHole cx={SX.column} cy={86} r={6} state="closed" />}
      {usesPalm && <SaxophonePalmFan states={SX_PALM_KEYS.map((id) => st(id))} />}

      {/* Bis is the small pearl tucked between L1 and L2; those two large
          neighbours remain visible, so its location is immediately clear. */}
      {closed.has('bis') && <SmallHole cx={198} cy={160} r={6} state="closed" />}

      {SX.lh.map((y, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={SX.column}
          cy={y}
          r={19}
          state={st(`lh-${index + 1}`)}
        />
      ))}

      {usesLeftPinky && (
        <SaxophoneLeftPinkyTable
          states={{
            gSharp: st('lp-gsharp'),
            b: st('lp-b'),
            cSharp: st('lp-csharp'),
            bFlat: st('lp-bb'),
          }}
        />
      )}

      {SX.rh.map((y, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={SX.column}
          cy={y}
          r={19}
          state={st(`rh-${index + 1}`)}
        />
      ))}

      {usesSide && <SaxophoneSideLadder states={SX_SIDE_KEYS.map((id) => st(id))} />}
      {closed.has('side-f-sharp') && <SaxophoneHighFSharpPair state="closed" />}

      {usesLowKey && (
        <SaxophoneLowKeys
          x={112}
          y={468}
          lowC={st('rp-c')}
          lowEFlat={st('rp-eb')}
        />
      )}
    </svg>
  )
}

/* ── Recorder ─────────────────────────────────────────────────────────────
   Thumb hole behind, seven in front, the lowest two drilled as double holes
   the way a baroque soprano is.
─────────────────────────────────────────────────────────────────────────── */

const RC = {
  column: 168,
  rail: 88,
  front: [92, 144, 196, 276, 328, 380, 432],
  divider: 236,
} as const

function RecorderChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)

  return (
    <svg className="li-chart__svg" viewBox="0 0 300 496" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__divider"
        x1={RC.column - 32}
        x2={RC.column + 32}
        y1={RC.divider}
        y2={RC.divider}
      />

      <ToneHole cx={RC.rail} cy={RC.front[0]} r={17} state={st('thumb')} label="thumb" />

      {RC.front.slice(0, 5).map((y, index) => (
        <ToneHole
          key={`hole-${index + 1}`}
          cx={RC.column}
          cy={y}
          r={17}
          state={st(`hole-${index + 1}`)}
          label={`${index + 1}`}
          labelX={RC.column + 44}
          labelY={y + 7}
        />
      ))}

      {/* Holes 6 and 7 are drilled as pairs on a baroque recorder. */}
      {[5, 6].map((index) => {
        const y = RC.front[index]!
        const state = st(`hole-${index + 1}`)
        return (
          <g key={`hole-${index + 1}`}>
            <ToneHole
              cx={RC.column - 10}
              cy={y - 4}
              r={9}
              state={state === 'half' ? 'closed' : state}
            />
            <ToneHole
              cx={RC.column + 10}
              cy={y + 4}
              r={9}
              state={state === 'half' ? 'open' : state}
            />
            <Caption x={RC.column + 44} y={y + 7} text={`${index + 1}`} />
          </g>
        )
      })}
    </svg>
  )
}

/* ── Flute ────────────────────────────────────────────────────────────────
   Printed on its side: six main keys split by hand, the E♭ spatula and the
   rollers at the foot, and the thumb keys on their own row below the left
   hand — the layout in every flute method book.
─────────────────────────────────────────────────────────────────────────── */

const FL = {
  row: 66,
  lh: [110, 154, 198],
  rh: [252, 296, 340],
  divider: 225,
} as const

function FluteChart({ closed }: { closed: ReadonlySet<string> }) {
  const empty = new Set<string>()
  const st = (id: string) => stateOf(id, closed, empty)
  const showTrills = hasAny(closed, ['trill-d', 'trill-dsharp'])

  return (
    <svg className="li-chart__svg" viewBox="0 0 490 190" preserveAspectRatio="xMidYMid meet">
      {FL.lh.map((x, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={x}
          cy={FL.row}
          r={17}
          state={st(`lh-${index + 1}`)}
        />
      ))}

      <line
        className="li-chart__divider"
        x1={FL.divider}
        x2={FL.divider}
        y1={FL.row - 28}
        y2={FL.row + 28}
      />

      {FL.rh.map((x, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={x}
          cy={FL.row}
          r={17}
          state={st(`rh-${index + 1}`)}
        />
      ))}

      {/* Keep the familiar three-part foot-key symbol visible on every note. */}
      <FluteFootKeys
        x={369}
        y={FL.row}
        c={st('foot-c')}
        cSharp={st('foot-csharp')}
        eFlat={st('side-eb')}
      />

      <FluteThumbKeys thumb={st('thumb')} thumbBFlat={st('thumb-bb')} />

      {closed.has('key-gsharp') && <FluteGSharpKey state="closed" />}

      {showTrills && (
        <g>
          <SmallHole cx={314} cy={154} r={8} state={st('trill-d')} />
          <SmallHole cx={340} cy={154} r={8} state={st('trill-dsharp')} />
        </g>
      )}
    </svg>
  )
}

/* ── Trumpet ──────────────────────────────────────────────────────────────
   Three valves, left to right, as every trumpet chart draws them.
─────────────────────────────────────────────────────────────────────────── */

function ValveChart({ pressed }: { pressed: ReadonlySet<string> }) {
  return (
    <svg className="li-chart__svg" viewBox="0 0 420 224" preserveAspectRatio="xMidYMid meet">
      {[1, 2, 3].map((valve, index) => {
        const x = 90 + index * 120
        const down = pressed.has(`valve-${valve}`)
        return (
          <g key={valve} className="li-chart__mark" data-state={down ? 'closed' : 'open'}>
            <circle className="li-chart__hole" cx={x} cy={86} r={44} strokeWidth={6} />
            <text className="li-chart__valve-number" x={x} y={98} textAnchor="middle">
              {valve}
            </text>
            <text className="li-chart__valve-state" x={x} y={178} textAnchor="middle">
              {down ? 'DOWN' : 'UP'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Trombone ─────────────────────────────────────────────────────────────
   A plain slide ruler: the two rails stop exactly where the hand belongs, the
   seven positions stay numbered, and the bell is an explicit landmark between
   third and fourth. This is easier to transfer to the real horn than a small
   side-on illustration.
─────────────────────────────────────────────────────────────────────────── */

const POSITION_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'] as const
const POSITION_CUES = [
  'all the way in',
  'a little way out',
  'hand just before the bell',
  'hand just past the bell',
  'halfway from 4th to 6th',
  'almost a full arm',
  'full comfortable reach',
] as const

function slideStopX(position: number): number {
  return 112 + (position - 1) * 63
}

function SlideChart({ position }: { position: number }) {
  const selectedX = slideStopX(position)
  const firstX = slideStopX(1)
  const lastX = slideStopX(7)
  const bellX = (slideStopX(3) + slideStopX(4)) / 2

  return (
    <svg className="li-chart__svg" viewBox="0 0 600 286" preserveAspectRatio="xMidYMid meet">
      <text className="li-chart__slide-caption" x={300} y={38} textAnchor="middle">
        {POSITION_ORDINALS[position - 1] ?? '1st'} POSITION
      </text>

      {/* The bell is an explicit landmark between third and fourth. A word is
          more useful to a beginner here than another miniature silhouette. */}
      <rect
        className="li-chart__bell-badge"
        x={bellX - 29}
        y={52}
        width={58}
        height={25}
        rx={12.5}
      />
      <text className="li-chart__landmark-label" x={bellX} y={70} textAnchor="middle">
        BELL
      </text>
      <line className="li-chart__bell-guide" x1={bellX} x2={bellX} y1={82} y2={218} />

      <line className="li-chart__travel" x1={firstX} x2={lastX + 24} y1={105} y2={105} />
      <line className="li-chart__travel" x1={firstX} x2={lastX + 24} y1={151} y2={151} />

      <line className="li-chart__tube" x1={72} x2={selectedX} y1={105} y2={105} />
      <line className="li-chart__tube" x1={72} x2={selectedX} y1={151} y2={151} />

      <rect
        className="li-chart__slide-grip"
        x={selectedX - 5}
        y={94}
        width={10}
        height={68}
        rx={5}
      />

      <path
        className="li-chart__tube li-chart__tube--out"
        fill="none"
        d={`M ${selectedX} 105 h 12 a 23 23 0 0 1 0 46 h -12`}
      />

      <text className="li-chart__direction-label" x={firstX} y={82} textAnchor="middle">
        ALL THE WAY IN
      </text>
      <text className="li-chart__direction-label" x={lastX + 24} y={82} textAnchor="end">
        OUT →
      </text>

      <line className="li-chart__slide-rail" x1={firstX} x2={lastX} y1={194} y2={194} />
      {POSITION_ORDINALS.map((_, index) => {
        const number = index + 1
        const x = slideStopX(number)
        const selected = number === position
        return (
          <g key={number} className="li-chart__slide-tick" data-state={selected ? 'on' : 'off'}>
            <circle className="li-chart__slide-stop" cx={x} cy={194} r={selected ? 16 : 9} />
            <text className="li-chart__slide-tick-label" x={x} y={201} textAnchor="middle">
              {number}
            </text>
          </g>
        )
      })}
      <text className="li-chart__slide-cue" x={300} y={274} textAnchor="middle">
        {POSITION_CUES[position - 1] ?? POSITION_CUES[0]}
      </text>
    </svg>
  )
}

/* ── Assembly ─────────────────────────────────────────────────────────── */

function fingeringSets(note: LessonNote): {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
} {
  switch (note.fingering.kind) {
    case 'keys':
    case 'valves':
      return { closed: new Set(note.fingering.pressed), half: new Set() }
    case 'holes':
      return {
        closed: new Set(note.fingering.closed ?? note.fingering.covered),
        half: new Set(note.fingering.halfClosed ?? []),
      }
    case 'slide':
      return { closed: new Set(), half: new Set() }
  }
}

/** Filled and hollow mean something slightly different on a hole and a key. */
const LEGEND_WORDS: Record<string, [string, string] | null> = {
  keys: ['pressed', 'open'],
  holes: ['covered', 'open'],
  valves: null,
  slide: null,
}

export default function FingeringChart({ instrument, note }: FingeringChartProps) {
  const titleId = useId()
  const { closed, half } = fingeringSets(note)
  const legend = LEGEND_WORDS[note.fingering.kind] ?? null

  const chart =
    instrument.chartKind === 'flute' ? (
      <FluteChart closed={closed} />
    ) : instrument.chartKind === 'clarinet' ? (
      <ClarinetChart closed={closed} half={half} />
    ) : instrument.chartKind === 'saxophone' ? (
      <SaxophoneChart closed={closed} half={half} />
    ) : instrument.chartKind === 'recorder' ? (
      <RecorderChart closed={closed} half={half} />
    ) : instrument.chartKind === 'valves' ? (
      <ValveChart pressed={closed} />
    ) : (
      <SlideChart position={note.fingering.kind === 'slide' ? note.fingering.position : 1} />
    )

  return (
    <figure
      className="li-chart"
      data-chart={instrument.chartKind}
      role="img"
      aria-labelledby={titleId}
    >
      <span id={titleId} className="li-sr-only">
        {`${instrument.name} fingering for ${note.writtenLabel}. ${note.recipe}`}
      </span>
      {chart}
      {legend && (
        <figcaption className="li-chart__legend" aria-hidden>
          <span data-state="closed">
            <i /> {legend[0]}
          </span>
          <span data-state="open">
            <i /> {legend[1]}
          </span>
        </figcaption>
      )}
    </figure>
  )
}
