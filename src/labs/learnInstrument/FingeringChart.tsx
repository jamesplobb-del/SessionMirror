import { useId } from 'react'
import type { Instrument, LessonNote } from './instrumentData'

export interface FingeringChartProps {
  instrument: Instrument
  note: LessonNote
}

/*
 * Fingering charts drawn the way they are printed.
 *
 * Every key on the instrument is on the diagram, not only the ones this note
 * needs — that is what makes a chart readable, because a student finds a key
 * by its shape and by its neighbours. A tone hole is a large circle, a palm or
 * trill key a small one, a side or pinky key a rounded lever, the clarinet
 * register key a teardrop, the saxophone octave key a triangle, and the flute
 * E♭ key a spatula on its lever arm. Filled means down, hollow means up.
 */

type MarkState = 'closed' | 'open' | 'half'

const STROKE = 4.5
const SMALL_STROKE = 3.4

function stateOf(
  id: string,
  closed: ReadonlySet<string>,
  half: ReadonlySet<string>,
): MarkState {
  if (half.has(id)) return 'half'
  return closed.has(id) ? 'closed' : 'open'
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
      <Halo x={cx - r - 8} y={cy - r - 8} w={(r + 8) * 2} h={(r + 8) * 2} show={halo && state !== 'open'} />
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

/** A side or pinky key: the rounded lever printed beside the stack. */
function Lever({
  x,
  y,
  w = 36,
  h = 14,
  state = 'open',
  label,
  labelX,
  labelY,
  halo,
}: KeyProps & { x: number; y: number; w?: number; h?: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo x={x - w / 2 - 8} y={y - h / 2 - 8} w={w + 16} h={h + 16} show={halo && state !== 'open'} />
      <rect
        className="li-chart__key"
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        strokeWidth={SMALL_STROKE}
      />
      {label && <Caption x={labelX ?? x} y={labelY ?? y + h / 2 + 22} text={label} />}
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
 * A spatula: a round touchpiece on a lever arm, the shape printed for the
 * flute E♭ key. The arm reaches back toward the holes it serves.
 */
function SpatulaKey({
  x,
  y,
  state = 'open',
  label,
  labelY,
  halo,
}: KeyProps & { x: number; y: number }) {
  return (
    <g className="li-chart__mark" data-state={state}>
      <Halo x={x - 34} y={y - 22} w={70} h={44} show={halo && state !== 'open'} />
      <rect
        className="li-chart__key"
        x={x - 26}
        y={y - 6}
        width={34}
        height={12}
        rx={6}
        strokeWidth={SMALL_STROKE}
      />
      <circle className="li-chart__key" cx={x + 12} cy={y} r={14} strokeWidth={STROKE} />
      {label && <Caption x={x} y={labelY ?? y + 38} text={label} />}
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
  rail: 86,
  lh: [140, 194, 248],
  rh: [326, 380, 434],
  divider: 287,
} as const

function ClarinetChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 556" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__body"
        x1={CL.column}
        x2={CL.column}
        y1={CL.lh[0] - 34}
        y2={CL.divider - 18}
      />
      <line
        className="li-chart__body"
        x1={CL.column}
        x2={CL.column}
        y1={CL.divider + 18}
        y2={CL.rh[2] + 34}
      />
      <line
        className="li-chart__divider"
        x1={CL.column - 34}
        x2={CL.column + 34}
        y1={CL.divider}
        y2={CL.divider}
      />

      {/* Back of the instrument: register key above the thumb hole. */}
      <TeardropKey x={CL.rail} y={62} state={st('octave')} label="register" halo />
      <ToneHole cx={CL.rail} cy={CL.lh[0]} state={st('thumb')} label="thumb" halo />

      {/* Throat keys, worked by the left index finger. */}
      <Lever x={258} y={100} w={36} state={st('key-a')} halo />
      <Lever x={258} y={128} w={36} state={st('key-gsharp')} halo />

      {CL.lh.map((y, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={CL.column}
          cy={y}
          state={st(`lh-${index + 1}`)}
          label={`L${index + 1}`}
          labelX={CL.column + 44}
          labelY={y + 7}
        />
      ))}

      {/* Left-hand pinky levers, at the foot of the upper joint. */}
      <Lever x={104} y={244} w={32} h={12} state={st('lp-e')} halo />
      <Lever x={104} y={268} w={32} h={12} state={st('lp-fsharp')} halo />
      <Lever x={104} y={292} w={32} h={12} state={st('lp-ab')} halo />
      <Lever x={104} y={316} w={32} h={12} state={st('lp-csharp')} halo />

      {/* Right-hand side trill keys. */}
      <Lever x={256} y={298} w={32} h={12} state={st('side-1')} halo />
      <Lever x={256} y={322} w={32} h={12} state={st('side-2')} halo />
      <Lever x={256} y={346} w={32} h={12} state={st('side-3')} halo />
      <Lever x={256} y={370} w={32} h={12} state={st('side-4')} halo />

      {CL.rh.map((y, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={CL.column}
          cy={y}
          state={st(`rh-${index + 1}`)}
          label={`R${index + 1}`}
          labelX={CL.column + 44}
          labelY={y + 7}
        />
      ))}

      {/* Right-hand pinky table. The low F/C key is the one lessons ask for. */}
      <Lever
        x={244}
        y={482}
        w={38}
        h={15}
        state={st('pinky-f')}
        label="F key"
        labelY={534}
        halo
      />
      <Lever x={244} y={510} w={38} h={15} state={st('rp-e')} halo />
      <Lever x={294} y={482} w={38} h={15} state={st('rp-fsharp')} halo />
      <Lever x={294} y={510} w={38} h={15} state={st('rp-ab')} halo />
    </svg>
  )
}

/* ── Saxophone ────────────────────────────────────────────────────────────
   Octave key on the left, palm keys above the left hand, side keys between
   the stacks, both pinky clusters below — the standard chart layout.
─────────────────────────────────────────────────────────────────────────── */

const SX = {
  column: 172,
  lh: [126, 182, 238],
  rh: [312, 368, 424],
  divider: 275,
} as const

function SaxophoneChart({
  closed,
  half,
}: {
  closed: ReadonlySet<string>
  half: ReadonlySet<string>
}) {
  const st = (id: string) => stateOf(id, closed, half)

  return (
    <svg className="li-chart__svg" viewBox="0 0 340 528" preserveAspectRatio="xMidYMid meet">
      <line
        className="li-chart__body"
        x1={SX.column}
        x2={SX.column}
        y1={SX.lh[0] - 34}
        y2={SX.divider - 18}
      />
      <line
        className="li-chart__body"
        x1={SX.column}
        x2={SX.column}
        y1={SX.divider + 18}
        y2={SX.rh[2] + 34}
      />
      <line
        className="li-chart__divider"
        x1={SX.column - 34}
        x2={SX.column + 34}
        y1={SX.divider}
        y2={SX.divider}
      />

      {/* Left thumb: the octave key. */}
      <TriangleKey x={84} y={SX.lh[0]} state={st('octave')} label="octave" halo />

      {/* Palm keys, above the left hand. */}
      <SmallHole cx={252} cy={62} state={st('palm-f')} />
      <SmallHole cx={266} cy={90} state={st('palm-eb')} />
      <SmallHole cx={252} cy={118} state={st('palm-d')} />

      {/* Bis key, tucked between the first two holes. */}
      <SmallHole cx={140} cy={154} r={8} state={st('bis')} />

      {SX.lh.map((y, index) => (
        <ToneHole
          key={`lh-${index + 1}`}
          cx={SX.column}
          cy={y}
          r={19}
          state={st(`lh-${index + 1}`)}
          label={`L${index + 1}`}
          labelX={SX.column + 44}
          labelY={y + 7}
        />
      ))}

      {/* Side keys, worked by the right index finger. */}
      <Lever x={256} y={192} w={32} h={13} state={st('side-e')} halo />
      <Lever x={256} y={216} w={32} h={13} state={st('side-c')} halo />
      <Lever x={256} y={240} w={32} h={13} state={st('side-bb')} halo />

      {/* Left-hand pinky table. */}
      <Lever x={100} y={266} w={30} h={12} state={st('lp-gsharp')} halo />
      <Lever x={100} y={290} w={30} h={12} state={st('lp-csharp')} halo />
      <Lever x={100} y={314} w={30} h={12} state={st('lp-b')} halo />
      <Lever x={100} y={338} w={30} h={12} state={st('lp-bb')} halo />

      {SX.rh.map((y, index) => (
        <ToneHole
          key={`rh-${index + 1}`}
          cx={SX.column}
          cy={y}
          r={19}
          state={st(`rh-${index + 1}`)}
          label={`R${index + 1}`}
          labelX={SX.column + 44}
          labelY={y + 7}
        />
      ))}

      {/* Side F♯, then the right-hand pinky keys at the foot. */}
      <Lever x={256} y={340} w={32} h={13} state={st('side-f-sharp')} halo />
      <Lever x={252} y={462} w={34} h={14} state={st('rp-eb')} halo />
      <Lever x={252} y={488} w={34} h={14} state={st('rp-c')} halo />
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
            <ToneHole cx={RC.column - 15} cy={y} r={11} state={state} />
            <ToneHole cx={RC.column + 15} cy={y} r={11} state={state} />
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

  return (
    <svg className="li-chart__svg" viewBox="0 0 490 214" preserveAspectRatio="xMidYMid meet">
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

      <SpatulaKey
        x={396}
        y={FL.row}
        state={st('side-eb')}
        label="E♭ key"
        labelY={FL.labelY}
        halo
      />

      {/* The two roller keys at the foot joint. */}
      <Lever x={460} y={FL.row - 13} w={26} h={9} state="open" />
      <Lever x={460} y={FL.row + 13} w={26} h={9} state="open" />

      {/* Thumb keys on their own row: B♭ on the left, B on the right. Every
          note in these lessons uses the B key, so that is the half that fills. */}
      <g className="li-chart__mark" data-state={thumbDown ? 'closed' : 'open'}>
        <Halo x={58} y={146} w={134} h={46} show={thumbDown} />
        <rect
          className="li-chart__key li-chart__key--ghost"
          x={68}
          y={155}
          width={54}
          height={28}
          rx={14}
          strokeWidth={SMALL_STROKE}
        />
        <rect
          className="li-chart__key"
          x={126}
          y={155}
          width={56}
          height={28}
          rx={14}
          strokeWidth={SMALL_STROKE}
        />
        <Caption x={126} y={206} text="thumb" />
      </g>

      {/* Second row: the keys the little fingers reach for, drawn where a
          method-book chart puts them — thumb keys under the left hand, G♯,
          trills and foot keys under the right. */}
      <Lever x={252} y={169} w={34} h={15} state={st('key-gsharp')} halo />
      <Caption x={252} y={206} text="G♯" />

      <g className="li-chart__mark" data-state={st('trill-d')}>
        <Halo x={294} y={151} w={36} h={36} show={st('trill-d') !== 'open'} />
        <circle className="li-chart__hole" cx={312} cy={169} r={12} strokeWidth={SMALL_STROKE} />
      </g>
      <Caption x={312} y={206} text="tr 1" />

      <g className="li-chart__mark" data-state={st('trill-dsharp')}>
        <Halo x={334} y={151} w={36} h={36} show={st('trill-dsharp') !== 'open'} />
        <circle className="li-chart__hole" cx={352} cy={169} r={12} strokeWidth={SMALL_STROKE} />
      </g>
      <Caption x={352} y={206} text="tr 2" />

      <Lever x={404} y={169} w={30} h={15} state={st('foot-c')} halo />
      <Caption x={404} y={206} text="C" />
      <Lever x={450} y={169} w={30} h={15} state={st('foot-csharp')} halo />
      <Caption x={450} y={206} text="C♯" />

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
   A tenor trombone side on: mouthpiece at the player's end, tuning bow behind
   it, bell facing forward over the slide, and the slide pushed out to the
   position this note asks for. The travel past first is drawn in a second
   colour and the seven stopping points are marked underneath.
─────────────────────────────────────────────────────────────────────────── */

const TB = {
  bellY: 96,
  slideTopY: 208,
  slideBottomY: 266,
  tube: 15,
  homeX: 336,
  stepX: 27,
  railY: 306,
} as const

const CROOK_R = (TB.slideBottomY - TB.slideTopY) / 2
const POSITION_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'] as const

function crookX(position: number): number {
  return TB.homeX + (position - 1) * TB.stepX
}

function SlideChart({ position }: { position: number }) {
  const end = crookX(position)
  const home = crookX(1)
  const far = crookX(7)

  return (
    <svg className="li-chart__svg" viewBox="0 0 600 344" preserveAspectRatio="xMidYMid meet">
      {/* How far the slide can reach, so "out to sixth" has something to mean. */}
      <line
        className="li-chart__travel"
        x1={home}
        x2={far + CROOK_R + 10}
        y1={TB.slideTopY}
        y2={TB.slideTopY}
      />
      <line
        className="li-chart__travel"
        x1={home}
        x2={far + CROOK_R + 10}
        y1={TB.slideBottomY}
        y2={TB.slideBottomY}
      />

      {/* Bell section: tuning bow behind the player, bell facing forward. */}
      <path
        className="li-chart__tube"
        fill="none"
        strokeWidth={TB.tube}
        d={`M 128 ${TB.slideBottomY} H 96 A 85 85 0 0 1 96 ${TB.bellY} H 336`}
      />
      <path
        className="li-chart__horn"
        d={`M 330 ${TB.bellY - 8}
            C 392 ${TB.bellY - 10} 428 ${TB.bellY - 20} 450 ${TB.bellY - 42}
            C 460 ${TB.bellY - 53} 466 ${TB.bellY - 62} 470 ${TB.bellY - 72}
            A 90 90 0 0 1 470 ${TB.bellY + 72}
            C 466 ${TB.bellY + 62} 460 ${TB.bellY + 53} 450 ${TB.bellY + 42}
            C 428 ${TB.bellY + 20} 392 ${TB.bellY + 10} 330 ${TB.bellY + 8} Z`}
      />

      {/* Mouthpiece and receiver, at the player's end of the slide. */}
      <path
        className="li-chart__horn"
        d={`M 168 ${TB.slideTopY - 13} L 146 ${TB.slideTopY - 22} A 7 22 0 0 0 146 ${
          TB.slideTopY + 22
        } L 168 ${TB.slideTopY + 13} Z`}
      />

      {/* Stationary half of the slide. */}
      <line
        className="li-chart__tube"
        x1={162}
        x2={home}
        y1={TB.slideTopY}
        y2={TB.slideTopY}
        strokeWidth={TB.tube}
      />
      <line
        className="li-chart__tube"
        x1={128}
        x2={home}
        y1={TB.slideBottomY}
        y2={TB.slideBottomY}
        strokeWidth={TB.tube}
      />

      {/* Braces: bell to slide, and across the slide where the hand grips. */}
      <rect
        className="li-chart__brace"
        x={294}
        y={TB.bellY + 8}
        width={11}
        height={TB.slideTopY - TB.bellY - 16}
        rx={5}
      />
      <rect
        className="li-chart__brace"
        x={222}
        y={TB.slideTopY + 8}
        width={11}
        height={TB.slideBottomY - TB.slideTopY - 16}
        rx={5}
      />

      {/* Everything past first position — how far this note pushes the slide. */}
      {position > 1 && (
        <>
          <line
            className="li-chart__tube li-chart__tube--out"
            x1={home - 2}
            x2={end}
            y1={TB.slideTopY}
            y2={TB.slideTopY}
            strokeWidth={TB.tube}
          />
          <line
            className="li-chart__tube li-chart__tube--out"
            x1={home - 2}
            x2={end}
            y1={TB.slideBottomY}
            y2={TB.slideBottomY}
            strokeWidth={TB.tube}
          />
        </>
      )}

      <path
        className={`li-chart__tube ${position > 1 ? 'li-chart__tube--out' : ''}`}
        fill="none"
        strokeWidth={TB.tube}
        d={`M ${end} ${TB.slideTopY} h 10 a ${CROOK_R} ${CROOK_R} 0 0 1 0 ${
          TB.slideBottomY - TB.slideTopY
        } h -10`}
      />

      <text className="li-chart__slide-caption" x={20} y={44} textAnchor="start">
        {POSITION_ORDINALS[position - 1] ?? '1st'} position
      </text>

      <line
        className="li-chart__slide-rail"
        x1={crookX(1) + CROOK_R}
        x2={crookX(7) + CROOK_R}
        y1={TB.railY}
        y2={TB.railY}
      />
      {POSITION_ORDINALS.map((_, index) => {
        const number = index + 1
        const x = crookX(number) + CROOK_R
        const selected = number === position
        return (
          <g key={number} className="li-chart__slide-tick" data-state={selected ? 'on' : 'off'}>
            <line x1={x} x2={x} y1={selected ? TB.railY - 14 : TB.railY - 7} y2={TB.railY + 7} />
            <text
              className="li-chart__slide-tick-label"
              x={x}
              y={TB.railY + 32}
              textAnchor="middle"
            >
              {number}
            </text>
          </g>
        )
      })}
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
