import { useEffect, useRef, useState } from 'react'

export type GameTravelWorld = 'arcade' | 'staff' | 'balance'

const TRAVEL_MS = 780

interface GameWorldTravelProps {
  isOpen: boolean
  route: 'menu' | 'staff-jumper' | 'balance'
}

function worldForRoute(route: GameWorldTravelProps['route']): GameTravelWorld {
  if (route === 'staff-jumper') return 'staff'
  if (route === 'balance') return 'balance'
  return 'arcade'
}

/**
 * Full-screen travel beat when Games opens or a title is chosen.
 * Presentational only — does not change routing or game state.
 */
export default function GameWorldTravel({ isOpen, route }: GameWorldTravelProps) {
  const [world, setWorld] = useState<GameTravelWorld | null>(null)
  const wasOpenRef = useRef(false)
  const routeRef = useRef(route)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (isOpen && !wasOpenRef.current) {
      setWorld('arcade')
    } else if (
      isOpen &&
      route !== routeRef.current &&
      (route === 'staff-jumper' || route === 'balance')
    ) {
      setWorld(worldForRoute(route))
    }

    wasOpenRef.current = isOpen
    routeRef.current = route
    if (!isOpen) setWorld(null)
  }, [isOpen, route])

  useEffect(() => {
    if (!world) return
    const timer = window.setTimeout(() => setWorld(null), TRAVEL_MS)
    return () => window.clearTimeout(timer)
  }, [world])

  if (!world) return null

  return (
    <div className={`game-world-travel game-world-travel--${world}`} aria-hidden>
      <div className="game-world-travel__sky" />
      <div className="game-world-travel__layer game-world-travel__layer--far" />
      <div className="game-world-travel__layer game-world-travel__layer--mid" />
      <div className="game-world-travel__layer game-world-travel__layer--near" />
      <div className="game-world-travel__core" />
      <div className="game-world-travel__vignette" />
    </div>
  )
}
