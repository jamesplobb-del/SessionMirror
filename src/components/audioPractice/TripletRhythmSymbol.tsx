export default function TripletRhythmSymbol({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 22"
      width="32"
      height="22"
      aria-hidden
    >
      <text
        x="16"
        y="5.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="600"
        fill="currentColor"
        fontFamily="system-ui, sans-serif"
      >
        3
      </text>
      <path
        d="M5 9.5 C5 7.5 7 6.5 9 6.5 H23 C25 6.5 27 7.5 27 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <line x1="7.5" y1="12" x2="24.5" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="9" y1="12" x2="9" y2="17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="9" cy="18.5" rx="1.55" ry="1.15" fill="currentColor" transform="rotate(-18 9 18.5)" />
      <line x1="16" y1="12" x2="16" y2="17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="16" cy="18.5" rx="1.55" ry="1.15" fill="currentColor" transform="rotate(-18 16 18.5)" />
      <line x1="23" y1="12" x2="23" y2="17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="23" cy="18.5" rx="1.55" ry="1.15" fill="currentColor" transform="rotate(-18 23 18.5)" />
    </svg>
  )
}
