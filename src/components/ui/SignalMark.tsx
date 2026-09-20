import { useId } from 'react'

/** Approved Signal artwork, shared with the native launch and app icon. */
export default function SignalMark() {
  const id = useId()
  return <svg className="signal-launch__mark" viewBox="0 0 200 200" width="110" height="110" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-gold`} x2="0" y2="1"><stop stopColor="#ffd55a"/><stop offset="1" stopColor="#efa91b"/></linearGradient>
      <linearGradient id={`${id}-blue`} x2="0" y2="1"><stop stopColor="#59caff"/><stop offset="1" stopColor="#0789e8"/></linearGradient>
    </defs>
    {[26, 52, 92, 140, 106, 66, 32].map((height, i) => <rect key={i}
      x={28 + i * 23} y={(200 - height) / 2} width="14" height={height} rx="7"
      style={{animationDelay:`${i * 24}ms`}} fill={`url(#${id}-${i < 3 ? 'gold' : 'blue'})`}/>) }
  </svg>
}
