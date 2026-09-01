interface HallDoorWorldProps {
  world: 'staff' | 'balance' | 'learn'
  characterSrc: string
}

/** A still of the game, cropped to the doorway. */
export default function HallDoorWorld({ world, characterSrc }: HallDoorWorldProps) {
  if (world === 'staff') return <StaffDoorWorld characterSrc={characterSrc} />
  if (world === 'balance') return <BalanceDoorWorld characterSrc={characterSrc} />
  return <LearnDoorWorld />
}

function StaffLines({ y, gap }: { y: number; gap: number }) {
  return (
    <g stroke="#2a3138" strokeWidth="1.1" opacity="0.48">
      {[0, 1, 2, 3, 4].map((line) => (
        <line key={line} x1="3" x2="69" y1={y + line * gap} y2={y + line * gap} />
      ))}
    </g>
  )
}

function QuarterNote({ x, y, gap }: { x: number; y: number; gap: number }) {
  const stem = gap * 2.7
  return (
    <g>
      <ellipse
        cx={x}
        cy={y}
        rx={gap * 0.7}
        ry={gap * 0.48}
        transform={`rotate(-20 ${x} ${y})`}
        fill="#16181d"
      />
      <rect x={x + gap * 0.48} y={y - stem} width="1.35" height={stem} fill="#16181d" />
    </g>
  )
}

/** Compact G-clef that sits on the staff without covering the notes. */
function TrebleClef({ x, gLine }: { x: number; gLine: number }) {
  return (
    <g
      fill="none"
      stroke="#16181d"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={`translate(${x} ${gLine})`}
    >
      <path d="M1.2 8.5c-4.2.2-6.6-3.2-6.4-6.4.3-4.6 5.2-6.8 8.4-12.8 1.6-3.1.2-7.2-3.6-7.6-3.6-.4-5.6 2.8-4.2 5.4 1.2 2.2 4.6 1.6 5.2-1.2" />
      <path d="M2.2-14.2c4.6 3.4 5.4 12.2.6 18.4l-2.4 14.6c-.3 3.2 2.8 5.2 5.4 3.6" />
      <circle cx="-0.4" cy="12.6" r="2.1" fill="#16181d" stroke="none" />
    </g>
  )
}

/**
 * Staff Jumper is a run of notes the player stands on. The doorway is a tall
 * crop, so the scale has to live in the middle of the frame.
 */
function StaffDoorWorld({ characterSrc }: { characterSrc: string }) {
  const top = 52
  const gap = 8
  const notes = [
    { x: 22, y: top + gap * 5 },
    { x: 33, y: top + gap * 4.5 },
    { x: 44, y: top + gap * 4 },
    { x: 55, y: top + gap * 3.5 },
    { x: 66, y: top + gap * 3 },
  ]
  const stand = notes[2]!

  return (
    <svg className="balance-door__preview" viewBox="0 0 72 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="72" height="140" fill="#f2f1ee" />
      <StaffLines y={top} gap={gap} />
      <line
        x1="16"
        x2="28"
        y1={notes[0]!.y}
        y2={notes[0]!.y}
        stroke="#2a3138"
        strokeWidth="1.1"
        opacity="0.48"
      />
      <TrebleClef x={12} gLine={top + gap * 3} />
      <ellipse cx={stand.x} cy={stand.y} rx="8.5" ry="6.2" fill="rgba(35, 152, 232, 0.22)" />
      {notes.map((note) => (
        <QuarterNote key={note.x} x={note.x} y={note.y} gap={gap} />
      ))}
      <image
        href={characterSrc}
        x={stand.x - 11}
        y={stand.y - 32}
        width="22"
        height="30"
        preserveAspectRatio="xMidYMax meet"
      />
    </svg>
  )
}

/**
 * Balance is a gold rope between two orange-decked cloud islands, with a
 * music-note flag on the far post — not a green hill.
 */
function BalanceDoorWorld({ characterSrc }: { characterSrc: string }) {
  return (
    <svg className="balance-door__preview" viewBox="0 0 72 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="hall-balance-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9dcf5" />
          <stop offset="0.48" stopColor="#c8edfd" />
          <stop offset="1" stopColor="#d7f2ff" />
        </linearGradient>
        <linearGradient id="hall-balance-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb84f" />
          <stop offset="0.56" stopColor="#f6a12f" />
          <stop offset="1" stopColor="#e5861c" />
        </linearGradient>
      </defs>
      <rect width="72" height="140" fill="url(#hall-balance-sky)" />
      <ellipse cx="16" cy="22" rx="16" ry="6" fill="#fff" opacity="0.9" />
      <ellipse cx="10" cy="26" rx="9" ry="4.5" fill="#fff" opacity="0.88" />
      <ellipse cx="22" cy="25" rx="8" ry="4" fill="#fff" opacity="0.8" />
      <ellipse cx="58" cy="34" rx="13" ry="5" fill="#fff" opacity="0.75" />

      <g>
        <polygon points="38,62 74,62 68,84 44,84" fill="#83c9ed" />
        <ellipse cx="56" cy="60" rx="14" ry="6" fill="url(#hall-balance-deck)" />
        <rect x="48" y="52" width="1.8" height="8" rx="0.9" fill="#ae6819" />
        <rect x="62" y="51" width="1.8" height="8.6" rx="0.9" fill="#ae6819" />
        <text x="64.5" y="50" fill="#1c4f78" fontSize="9" fontWeight={800} fontFamily="Georgia, serif">
          ♪
        </text>
      </g>

      <path
        d="M24 100 C34 88 44 74 56 60"
        fill="none"
        stroke="#c17a18"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path
        d="M24 100 C34 88 44 74 56 60"
        fill="none"
        stroke="#f5ae35"
        strokeWidth="2.7"
        strokeLinecap="round"
      />

      <g>
        <polygon points="-8,112 58,112 48,146 2,146" fill="#71bde7" />
        <ellipse cx="26" cy="110" rx="30" ry="11" fill="url(#hall-balance-deck)" />
        <rect x="18" y="92" width="3" height="14" rx="1.3" fill="#8f501b" />
      </g>
      <image
        href={characterSrc}
        x="10"
        y="70"
        width="26"
        height="36"
        preserveAspectRatio="xMidYMax meet"
      />
    </svg>
  )
}

/**
 * Learn's play screen is a written C and its fingering. Written C is open on
 * a three-valve brass horn — valves 1, 2, and 3 all up.
 */
function LearnDoorWorld() {
  const top = 40
  const gap = 6.6
  const noteY = top + gap * 1.5

  return (
    <svg className="balance-door__preview" viewBox="0 0 72 140" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="72" height="140" fill="#f7f4ee" />
      <rect x="5" y="8" width="62" height="68" rx="7" fill="#fff" stroke="#e7e1d6" strokeWidth="1.1" />
      <text
        x="36"
        y="26"
        textAnchor="middle"
        fill="#1c1917"
        fontSize="15"
        fontWeight={700}
        fontFamily="ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"
      >
        C
      </text>
      <StaffLines y={top} gap={gap} />
      <TrebleClef x={14} gLine={top + gap * 3} />
      <ellipse
        cx="48"
        cy={noteY}
        rx={gap * 0.78}
        ry={gap * 0.52}
        transform={`rotate(-20 48 ${noteY})`}
        fill="#fff"
        stroke="#1c1917"
        strokeWidth="1.6"
      />

      <rect x="5" y="84" width="62" height="48" rx="7" fill="#fff" stroke="#e7e1d6" strokeWidth="1.1" />
      {[0, 1, 2].map((valve) => {
        const x = 22 + valve * 14
        return (
          <g key={valve}>
            <circle cx={x} cy="102" r="6.2" fill="#fff" stroke="#1c1917" strokeWidth="1.7" />
            <text
              x={x}
              y="104.6"
              textAnchor="middle"
              fill="#1c1917"
              fontSize="6.5"
              fontWeight={800}
              fontFamily="ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"
            >
              {valve + 1}
            </text>
            <text
              x={x}
              y="118"
              textAnchor="middle"
              fill="#76716b"
              fontSize="5.2"
              fontWeight={700}
              fontFamily="ui-rounded, 'SF Pro Rounded', system-ui, sans-serif"
            >
              UP
            </text>
          </g>
        )
      })}
    </svg>
  )
}
