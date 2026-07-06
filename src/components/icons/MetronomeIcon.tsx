/** Simple pendulum metronome glyph (not a stopwatch). */
export default function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 20h12" />
      <path d="M8 20V9l4-5 4 5v11" />
      <path d="M12 4v8" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
