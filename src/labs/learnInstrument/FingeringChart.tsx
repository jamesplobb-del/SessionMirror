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

const AUXILIARY_LABELS: Readonly<Record<string, string>> = {
  'palm-d': 'palm D',
  'palm-eb': 'palm E♭',
  'palm-f': 'palm F',
  'side-e': 'side E',
  'side-c': 'side C',
  'side-bb': 'side B♭',
  'lp-gsharp': 'G♯',
  'lp-csharp': 'C♯',
  'lp-b': 'low B',
  'lp-bb': 'low B♭',
  'lp-e': 'low E',
  'lp-fsharp': 'F♯',
  'lp-ab': 'A♭',
  'pinky-f': 'low F',
  'rp-e': 'E',
  'rp-fsharp': 'F♯',
  'rp-ab': 'A♭',
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

/**
 * A shaped auxiliary touchpiece with a narrow arm. Rotating the whole key is
 * enough to make the small clarinet/saxophone clusters read like their real
 * hardware instead of a stack of identical pills.
 */
function PaddleKey({
  x,
  y,
  angle = 0,
  state = 'open',
  label,
  labelX,
  labelY,
  halo,
}: KeyProps & { x: number; y: number; angle?: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo x={x - 24} y={y - 20} w={48} h={40} show={halo && state !== 'open'} />
      <g transform={`rotate(${angle} ${x} ${y})`}>
        <line className="li-chart__key-arm" x1={x - 18} x2={x + 4} y1={y} y2={y} />
        <path
          className="li-chart__key"
          strokeWidth={SMALL_STROKE}
          d={`M ${x + 1} ${y - 9}
              C ${x + 13} ${y - 10} ${x + 22} ${y - 5} ${x + 22} ${y}
              C ${x + 22} ${y + 5} ${x + 13} ${y + 10} ${x + 1} ${y + 9}
              C ${x - 3} ${y + 6} ${x - 3} ${y - 6} ${x + 1} ${y - 9} Z`}
        />
      </g>
      {label && <Caption x={labelX ?? x} y={labelY ?? y + 28} text={label} />}
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
      <Halo x={x - 25} y={y - 37} w={50} h={68} show={halo && state !== 'open'} />
      <path
        className="li-chart__key"
        strokeWidth={STROKE}
        d={`M ${x} ${y - 29} C ${x + 16} ${y - 7} ${x + 16} ${y + 16} ${x} ${y + 22}
            C ${x - 16} ${y + 16} ${x - 16} ${y - 7} ${x} ${y - 29} Z`}
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
        d={`M ${x} ${y - 21} L ${x + 20} ${y + 15} L ${x - 20} ${y + 15} Z`}
      />
      {label && <Caption x={x} y={labelY ?? y + 40} text={label} />}
    </g>
  )
}

/**
 * The three foot-joint touchpieces at the end of a simple flute chart. Their
 * silhouette matters more than their names here: C♯ is the upright loop, E♭
 * is the short upper roller, and C is the lower oval.
 */
/**
 * The right-hand pinky cluster at the end of a flute chart.
 *
 * The E♭ key is the wide oval the pinky rests on, and it is down for nearly
 * every note on the instrument — so it gets the prominent shape, sitting right
 * after the third right-hand finger. The two rollers beyond it are the foot
 * C♯ and C keys, which the pinky only slides onto for the bottom two notes.
 * Each one is named when it is in use: a chart that lights the wrong pinky key
 * teaches the wrong hand.
 */
function FluteFootKeys({
  x,
  y,
  labelY,
  c,
  cSharp,
  eFlat,
}: {
  x: number
  y: number
  labelY: number
  c: MarkState
  cSharp: MarkState
  eFlat: MarkState
}) {
  const rollerY = (offset: number) => y + offset

  return (
    <g>
      <g className="li-chart__mark" data-state={eFlat}>
        <Halo x={x - 23} y={y - 29} w={46} h={58} show={eFlat !== 'open'} />
        <ellipse
          className="li-chart__key"
          cx={x}
          cy={y}
          rx={15}
          ry={21}
          strokeWidth={STROKE}
        />
      </g>
      <Caption x={x} y={labelY} text="E♭" />

      <g className="li-chart__mark" data-state={cSharp}>
        <Halo x={x + 30} y={rollerY(-19) - 8} w={44} h={30} show={cSharp !== 'open'} />
        <rect
          className="li-chart__key"
          x={x + 34}
          y={rollerY(-19)}
          width={36}
          height={12}
          rx={6}
          strokeWidth={SMALL_STROKE}
        />
      </g>
      <g className="li-chart__mark" data-state={c}>
        <Halo x={x + 30} y={rollerY(7) - 8} w={44} h={30} show={c !== 'open'} />
        <rect
          className="li-chart__key"
          x={x + 34}
          y={rollerY(7)}
          width={36}
          height={12}
          rx={6}
          strokeWidth={SMALL_STROKE}
        />
      </g>
      {(cSharp !== 'open' || c !== 'open') && (
        <Caption x={x + 52} y={labelY} text={cSharp !== 'open' ? 'C♯' : 'C'} />
      )}
    </g>
  )
}

/**
 * The compact linked low-E/low-F symbol used at the bottom of beginner
 * clarinet charts. It supplies the one neighbouring key a student needs for
 * orientation without drawing the entire lower-joint mechanism.
 */
function ClarinetEndKeys({
  x,
  y,
  lowE,
  lowF,
}: {
  x: number
  y: number
  lowE: MarkState
  lowF: MarkState
}) {
  const keyPath = (offsetY: number, flip: boolean) =>
    `M ${x - 24} ${y + offsetY}
     C ${x - 11} ${y + offsetY - (flip ? -8 : 8)} ${x + 15} ${y + offsetY - (flip ? -7 : 7)} ${x + 27} ${y + offsetY}
     C ${x + 14} ${y + offsetY + (flip ? -8 : 8)} ${x - 11} ${y + offsetY + (flip ? -7 : 7)} ${x - 24} ${y + offsetY} Z`

  return (
    <g aria-hidden>
      <g className="li-chart__mark" data-state={lowF}>
        <path className="li-chart__key" strokeWidth={SMALL_STROKE} d={keyPath(-7, false)} />
      </g>
      <g className="li-chart__mark" data-state={lowE}>
        <path className="li-chart__key" strokeWidth={SMALL_STROKE} d={keyPath(7, true)} />
      </g>
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
          d={`M ${x - 23} ${y} A 23 12 0 0 1 ${x + 23} ${y} L ${x - 23} ${y} Z`}
        />
      </g>
      <g className="li-chart__mark" data-state={lowC}>
        <path
          className="li-chart__key"
          strokeWidth={SMALL_STROKE}
          d={`M ${x - 23} ${y} A 23 12 0 0 0 ${x + 23} ${y} L ${x - 23} ${y} Z`}
        />
      </g>
    </g>
  )
}

/** Three tiny side-key touchpieces, kept as a compact landmark block. */
function SaxophoneSideBlock({
  x,
  y,
  states,
}: {
  x: number
  y: number
  states: readonly MarkState[]
}) {
  return (
    <g aria-hidden>
      {states.map((state, index) => (
        <g key={index} className="li-chart__mark" data-state={state}>
          <rect
            className="li-chart__key"
            x={x + (index % 2) * 18}
            y={y + Math.floor(index / 2) * 18}
            width={15}
            height={14}
            rx={3}
            strokeWidth={SMALL_STROKE}
          />
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

const CL_THROAT_KEYS = ['key-a', 'key-gsharp'] as const
const CL_LEFT_PINKY_KEYS = ['lp-fsharp', 'lp-ab', 'lp-csharp'] as const
const CL_SIDE_KEYS = ['side-1', 'side-2', 'side-3', 'side-4'] as const
const CL_RIGHT_PINKY_KEYS = ['rp-e', 'rp-fsharp', 'rp-ab'] as const

function ClarinetChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)
  const showThroat = hasAny(closed, CL_THROAT_KEYS)
  const showLeftPinky = hasAny(closed, CL_LEFT_PINKY_KEYS)
  const showSide = hasAny(closed, CL_SIDE_KEYS)
  const showRightPinky = hasAny(closed, CL_RIGHT_PINKY_KEYS)

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 532" preserveAspectRatio="xMidYMid meet">
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

      {/* A and A♭/G♯ are shown as a pair only when one is part of the note. */}
      {showThroat && (
        <g>
          <PaddleKey
            x={258}
            y={102}
            angle={-18}
            state={st('key-a')}
            label={closed.has('key-a') ? 'A key' : undefined}
            labelX={286}
            labelY={78}
            halo
          />
          <PaddleKey
            x={264}
            y={132}
            angle={12}
            state={st('key-gsharp')}
            label={closed.has('key-gsharp') ? 'G♯ key' : undefined}
            labelX={288}
            labelY={164}
            halo
          />
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

      {/* A contextual pair replaces the full four-key left pinky table. */}
      {showLeftPinky && (
        <g>
          {(() => {
            const selected = CL_LEFT_PINKY_KEYS.find((id) => closed.has(id))!
            const neighbour = selected === 'lp-csharp' ? 'lp-ab' : 'lp-csharp'
            return [selected, neighbour].map((id, index) => (
              <PaddleKey
                key={id}
                x={100 - index * 8}
                y={248 + index * 27}
                angle={index === 0 ? 12 : -12}
                state={st(id)}
                label={closed.has(id) ? AUXILIARY_LABELS[id] : undefined}
                labelX={52}
                labelY={254 + index * 27}
                halo
              />
            ))
          })()}
        </g>
      )}

      {showSide && (
        <g>
          {CL_SIDE_KEYS.map((id, index) => (
            <PaddleKey
              key={id}
              x={256 + (index % 2) * 8}
              y={298 + index * 26}
              angle={index % 2 === 0 ? -10 : 10}
              state={st(id)}
              label={closed.has(id) ? `side ${index + 1}` : undefined}
              labelX={304}
              labelY={304 + index * 26}
              halo
            />
          ))}
        </g>
      )}

      {CL.rh.map((y, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={CL.column}
          cy={y}
          state={st(`rh-${index + 1}`)}
        />
      ))}

      {showRightPinky && (
        <g>
          {(() => {
            const selected = CL_RIGHT_PINKY_KEYS.find((id) => closed.has(id))!
            const neighbour = selected === 'rp-ab' ? 'rp-fsharp' : 'rp-ab'
            return [selected, neighbour].map((id, index) => (
              <PaddleKey
                key={id}
                x={252 + index * 42}
                y={470}
                angle={index === 0 ? -8 : 8}
                state={st(id)}
                label={closed.has(id) ? AUXILIARY_LABELS[id] : undefined}
                labelY={503}
                halo
              />
            ))
          })()}
        </g>
      )}

      <ClarinetEndKeys
        x={CL.column}
        y={492}
        lowE={st('lp-e')}
        lowF={st('pinky-f')}
      />
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
  const showLeftPinky = hasAny(closed, SX_LEFT_PINKY_KEYS)

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 516" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__divider"
        x1={SX.column - 34}
        x2={SX.column + 34}
        y1={SX.divider}
        y2={SX.divider}
      />

      {/* Printed charts keep these few landmarks in place on every note. */}
      <TriangleKey x={112} y={SX.lh[0]} state={st('octave')} />
      <SmallHole cx={SX.column} cy={82} r={7} state={st('front-f')} />

      <g aria-hidden>
        {SX_PALM_KEYS.map((id, index) => (
          <SmallHole
            key={id}
            cx={236 + (index === 1 ? 17 : 0)}
            cy={92 + index * 18}
            r={6}
            state={st(id)}
          />
        ))}
      </g>

      {/* Bis is the small pearl tucked between L1 and L2; those two large
          neighbours remain visible, so its location is immediately clear. */}
      {closed.has('bis') && (
        <SmallHole cx={144} cy={154} r={8} state="closed" />
      )}

      {SX.lh.map((y, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={SX.column}
          cy={y}
          r={19}
          state={st(`lh-${index + 1}`)}
        />
      ))}

      <SaxophoneSideBlock x={232} y={218} states={SX_SIDE_KEYS.map(st)} />

      {showLeftPinky && (
        <g>
          {(() => {
            const selected = SX_LEFT_PINKY_KEYS.find((id) => closed.has(id))!
            const neighbour = selected === 'lp-bb' ? 'lp-b' : 'lp-bb'
            return [selected, neighbour].map((id, index) => (
              <PaddleKey
                key={id}
                x={105 - index * 7}
                y={292 + index * 27}
                angle={index === 0 ? 10 : -10}
                state={st(id)}
                halo
              />
            ))
          })()}
        </g>
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

      {/* The lower side-key pair is a permanent location cue. */}
      <SmallHole cx={132} cy={338} r={6} state="open" />
      <SmallHole cx={132} cy={358} r={6} state="open" />

      {closed.has('side-f-sharp') && (
        <PaddleKey
          x={260}
          y={344}
          angle={-12}
          state="closed"
          halo
        />
      )}

      <SaxophoneLowKeys
        x={SX.column}
        y={474}
        lowC={st('rp-c')}
        lowEFlat={st('rp-eb')}
      />
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
        className="li-chart__body"
        x1={RC.column}
        x2={RC.column}
        y1={RC.front[0] - 32}
        y2={RC.divider - 16}
      />
      <line
        className="li-chart__body"
        x1={RC.column}
        x2={RC.column}
        y1={RC.divider + 16}
        y2={RC.front[6] + 32}
      />
      <line
        className="li-chart__divider"
        x1={RC.column - 32}
        x2={RC.column + 32}
        y1={RC.divider}
        y2={RC.divider}
      />

      <ToneHole cx={RC.rail} cy={RC.front[0]} r={17} state={st('thumb')} label="thumb" halo />

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
              cx={RC.column - 15}
              cy={y}
              r={11}
              state={state === 'half' ? 'closed' : state}
            />
            <ToneHole cx={RC.column + 15} cy={y} r={11} state={state === 'half' ? 'open' : state} />
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
  labelY: 112,
} as const

function FluteChart({ closed }: { closed: ReadonlySet<string> }) {
  const empty = new Set<string>()
  const st = (id: string) => stateOf(id, closed, empty)
  const thumbDown = st('thumb') === 'closed'
  const showTrills = hasAny(closed, ['trill-d', 'trill-dsharp'])

  return (
    <svg className="li-chart__svg" viewBox="0 0 490 190" preserveAspectRatio="xMidYMid meet">
      <line className="li-chart__body" x1={86} x2={366} y1={FL.row} y2={FL.row} />

      {FL.lh.map((x, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={x}
          cy={FL.row}
          r={17}
          state={st(`lh-${index + 1}`)}
          label={`L${index + 1}`}
          labelY={FL.labelY}
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
          label={`R${index + 1}`}
          labelY={FL.labelY}
        />
      ))}

      {/* Keep the familiar three-part foot-key silhouette visible on every
          note, exactly as it appears at the end of a printed flute chart. */}
      <FluteFootKeys
        x={392}
        y={FL.row}
        labelY={FL.labelY}
        c={st('foot-c')}
        cSharp={st('foot-csharp')}
        eFlat={st('side-eb')}
      />

      {/* The neighbouring B♭ thumb lever remains hollow beside the pressed
          B lever. This is exactly the small bit of context a student needs. */}
      {thumbDown && (
        <g className="li-chart__mark" data-state="closed">
          <Halo x={58} y={132} w={134} h={44} show />
          <rect
            className="li-chart__key li-chart__key--ghost"
            x={68}
            y={140}
            width={54}
            height={28}
            rx={14}
            strokeWidth={SMALL_STROKE}
          />
          <rect
            className="li-chart__key"
            x={126}
            y={140}
            width={56}
            height={28}
            rx={14}
            strokeWidth={SMALL_STROKE}
          />
          <Caption x={126} y={187} text="thumb" />
        </g>
      )}

      {closed.has('key-gsharp') && (
        <PaddleKey x={252} y={154} angle={-8} state="closed" label="G♯" labelY={186} halo />
      )}

      {showTrills && (
        <g>
          <SmallHole cx={318} cy={154} r={12} state={st('trill-d')} />
          <SmallHole cx={354} cy={154} r={12} state={st('trill-dsharp')} />
          <Caption x={336} y={186} text={closed.has('trill-d') ? 'D trill' : 'D♯ trill'} />
        </g>
      )}

      <text className="li-chart__hand-text" x={154} y={FL.row - 38} textAnchor="middle">
        LEFT HAND
      </text>
      <text className="li-chart__hand-text" x={296} y={FL.row - 38} textAnchor="middle">
        RIGHT HAND
      </text>
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
