import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Play, Star } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import BalanceStars from './BalanceStars'
import {
  balanceLevelIsUnlocked,
  balanceLevelObjective,
  balanceLevelsForWorld,
  balanceNextLevel,
  balanceTotalStars,
  balanceWorldStars,
  BALANCE_MAX_STARS,
  BALANCE_WORLDS,
  type BalanceLevel,
} from './balanceLevels'
import type { BalanceLevelProgress } from './balanceTypes'

interface BalanceTrailProps {
  instrumentId: string
  levels: Record<string, BalanceLevelProgress>
  hapticFeedback: boolean
  onBack: () => void
  onPlayLevel: (level: BalanceLevel) => void
}

/** Vertical pitch of one level on the trail, in the path's own coordinates. */
const SLOT = 112
/** The weave: centre, right, centre, left, repeating. */
const LANE_X = (index: number) => 50 + 26 * Math.sin((index * Math.PI) / 2)

/**
 * A rope through the level nodes.
 *
 * Each pair is joined by a cubic with vertical handles, which gives the slack
 * S-curve of a hanging line rather than the elbow of a polyline. The path is
 * drawn in the same 100-wide space the nodes are positioned in, so the two
 * cannot drift apart; `vector-effect` keeps the rope an even thickness when
 * that space is squeezed on a narrow phone.
 */
function ropePath(points: readonly { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let path = `M${points[0]!.x} ${points[0]!.y}`
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    const bend = (to.y - from.y) * 0.55
    path += ` C${from.x} ${from.y + bend} ${to.x} ${to.y - bend} ${to.x} ${to.y}`
  }
  return path
}

export default function BalanceTrail({
  instrumentId,
  levels,
  hapticFeedback,
  onBack,
  onPlayLevel,
}: BalanceTrailProps) {
  const nextLevel = useMemo(() => balanceNextLevel(levels), [levels])
  const [selectedId, setSelectedId] = useState(nextLevel.id)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const currentNodeRef = useRef<HTMLButtonElement | null>(null)

  const selected =
    BALANCE_WORLDS.flatMap((world) => balanceLevelsForWorld(world.id)).find(
      (level) => level.id === selectedId,
    ) ?? nextLevel
  const selectedUnlocked = balanceLevelIsUnlocked(selected, levels)
  const selectedStars = levels[selected.id]?.stars ?? 0

  /*
   * Open on the level the player is actually up to, not at level 1 — by world
   * three that would be a long scroll before anything is playable.
   *
   * Measured from the two rectangles rather than `offsetTop`: the nodes are
   * absolutely positioned, so their offset parent is the world's path box, not
   * the scroller, and offsetTop would place world four's levels as though they
   * were world one's.
   */
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const frame = window.requestAnimationFrame(() => {
      const node = currentNodeRef.current
      if (!node) return
      const delta =
        node.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + delta - scroller.clientHeight * 0.5),
        behavior: 'auto',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <BalanceArcadeShell
      title="Balance"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Back to Balance home"
      stat={{ label: 'Stars', value: `${balanceTotalStars(levels)}/${BALANCE_MAX_STARS}` }}
      className="balance-arcade--trail"
      scrollBody={false}
      footer={
        <section className="balance-trail__dock">
          <header>
            <span className="balance-pill">Level {selected.number}</span>
            <h2>{selected.name}</h2>
            <p>
              {selectedUnlocked
                ? balanceLevelObjective(selected, instrumentId)
                : 'Clear the level before this one to unlock it.'}
            </p>
          </header>
          {selectedUnlocked ? (
            <Pressable
              haptic="medium"
              hapticFeedback={hapticFeedback}
              className="balance-cta"
              onClick={() => onPlayLevel(selected)}
            >
              <Play aria-hidden /> {selectedStars > 0 ? 'Play again' : 'Play level'}
            </Pressable>
          ) : (
            <Pressable
              hapticFeedback={hapticFeedback}
              className="balance-cta"
              disabled
              aria-disabled
            >
              <Lock aria-hidden /> Locked
            </Pressable>
          )}
        </section>
      }
    >
      <div className="balance-trail__scroll" ref={scrollRef}>
        <h1 className="balance-display balance-display--page">Sky Trail</h1>

        {BALANCE_WORLDS.map((world) => {
          const worldLevels = balanceLevelsForWorld(world.id)
          const stars = balanceWorldStars(world.id, levels)
          const points = worldLevels.map((_, index) => ({
            x: LANE_X(index),
            y: index * SLOT + SLOT / 2,
          }))
          const height = worldLevels.length * SLOT
          const unlockedCount = worldLevels.filter((level) =>
            balanceLevelIsUnlocked(level, levels),
          ).length

          return (
            <section
              key={world.id}
              className="balance-trail__world"
              style={{
                ['--world-accent' as string]: world.accent,
                ['--world-accent-dark' as string]: world.accentDark,
              }}
            >
              <header className="balance-trail__banner">
                <strong>{world.name}</strong>
                <span><Star aria-hidden />{stars.earned}/{stars.possible}</span>
              </header>

              <div className="balance-trail__path" style={{ height: `${height}px` }}>
                <svg
                  className="balance-trail__rope"
                  viewBox={`0 0 100 ${height}`}
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path className="is-shadow" d={ropePath(points)} vectorEffect="non-scaling-stroke" />
                  <path className="is-locked" d={ropePath(points)} vectorEffect="non-scaling-stroke" />
                  {unlockedCount > 1 && (
                    <path d={ropePath(points.slice(0, unlockedCount))} vectorEffect="non-scaling-stroke" />
                  )}
                </svg>

                {worldLevels.map((level, index) => {
                  const progress = levels[level.id]
                  const unlocked = balanceLevelIsUnlocked(level, levels)
                  const cleared = (progress?.stars ?? 0) > 0
                  const isCurrent = level.id === nextLevel.id
                  const point = points[index]!
                  return (
                    <Pressable
                      key={level.id}
                      ref={isCurrent ? currentNodeRef : undefined}
                      intensity="soft"
                      squish={false}
                      hapticFeedback={hapticFeedback}
                      className={[
                        'balance-node',
                        level.isBoss ? 'balance-node--boss' : '',
                        cleared ? 'balance-node--cleared' : '',
                        !unlocked ? 'balance-node--locked' : '',
                        isCurrent ? 'balance-node--current' : '',
                        level.id === selected.id ? 'is-selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={{ left: `${point.x}%`, top: `${point.y}px` }}
                      aria-label={`Level ${level.number}, ${level.name}${
                        unlocked ? `, ${progress?.stars ?? 0} of 3 stars` : ', locked'
                      }`}
                      aria-pressed={level.id === selected.id}
                      onClick={() => setSelectedId(level.id)}
                    >
                      <span className="balance-node__disc" aria-hidden>
                        {unlocked ? level.number : <Lock />}
                      </span>
                      <BalanceStars
                        earned={progress?.stars ?? 0}
                        className="balance-node__stars"
                      />
                      {(isCurrent || level.isBoss) && (
                        <span className="balance-node__name">{level.name}</span>
                      )}
                    </Pressable>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </BalanceArcadeShell>
  )
}
