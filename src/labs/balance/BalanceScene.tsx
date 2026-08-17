import { useEffect, useRef, type MutableRefObject } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import type { BalancePhase, BalanceTarget, BalanceVisualSnapshot } from './balanceTypes'
import type { BalanceCharacterId } from './balanceCharacters'
import BalanceCharacter from './BalanceCharacter'

interface BalanceSceneProps {
  phase: BalancePhase
  target: BalanceTarget | null
  visualRef: MutableRefObject<BalanceVisualSnapshot>
  characterId: BalanceCharacterId
  toleranceCents: number
}

export default function BalanceScene({
  phase,
  target,
  visualRef,
  characterId,
  toleranceCents,
}: BalanceSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const characterRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  const active = phase === 'active'

  useEffect(() => {
    const scene = sceneRef.current
    const character = characterRef.current
    if (!scene || !character) return
    let frame = 0
    let lastAt = performance.now()
    let visualCents = visualRef.current.cents
    let visualProgress = visualRef.current.progress
    let travel = 0
    let sceneWidth = scene.clientWidth
    let sceneHeight = scene.clientHeight
    const resizeObserver = new ResizeObserver(() => {
      sceneWidth = scene.clientWidth
      sceneHeight = scene.clientHeight
    })
    resizeObserver.observe(scene)

    const cubic = (start: number, controlOne: number, controlTwo: number, end: number, t: number) => {
      const inverse = 1 - t
      return (
        inverse * inverse * inverse * start +
        3 * inverse * inverse * t * controlOne +
        3 * inverse * t * t * controlTwo +
        t * t * t * end
      )
    }

    const tick = (now: number) => {
      const dt = Math.min(40, now - lastAt)
      lastAt = now
      const snapshot = visualRef.current
      const centsTarget = Math.max(-30, Math.min(30, snapshot.cents))
      const progressTarget = Math.max(0, Math.min(1, snapshot.progress))
      const centsEase = prefersReducedMotion ? 1 : Math.min(1, dt * 0.008)
      const progressEase = prefersReducedMotion ? 1 : Math.min(1, dt * 0.01)
      visualCents += (centsTarget - visualCents) * centsEase
      visualProgress += (progressTarget - visualProgress) * progressEase
      const currentPhase = scene.dataset.phase
      const scoringActive = currentPhase === 'active'
      const completing = currentPhase === 'goalReached'
      const resting = currentPhase === 'resting'
      const walking =
        (scoringActive && snapshot.pitchPresent && snapshot.speed > 0.05) ||
        (completing && visualProgress < 0.975)
      if (walking && !prefersReducedMotion) travel += dt * Math.max(0.28, snapshot.speed) * 0.042

      // Follow the same normalized cubic used by the SVG rope. The visible
      // journey starts above the foreground anchor and ends on the far deck.
      const ropeT = 0.73 + (0.025 - 0.73) * visualProgress
      const ropeX = cubic(75, 55, 35, 20, ropeT)
      const ropeY = cubic(0, 30, 67, 100, ropeT)
      const characterX = sceneWidth * (0.3 + (ropeX / 100) * 0.4)
      const characterY = sceneHeight * (0.368 + (ropeY / 100) * 0.44)
      // Once the player moves out from the foreground platform, keep them in
      // a stable lower-middle follow zone. The world moves around that anchor,
      // which makes the next island visibly approach instead of shrinking the
      // character into the distance.
      const cameraAnchorX = sceneWidth * 0.48
      const cameraAnchorY = sceneHeight * 0.62
      const followEase = visualProgress * visualProgress * (3 - 2 * visualProgress)
      const cameraX = (cameraAnchorX - characterX) * followEase
      const cameraY = Math.max(0, cameraAnchorY - characterY)
      const characterScale = 1 - visualProgress * 0.16
      const lean = Math.max(-11, Math.min(11, visualCents * 0.5))
      const stepDuration = 1200 - Math.max(0, Math.min(1, snapshot.speed)) * 400

      character.style.setProperty('--balance-character-x', `${characterX}px`)
      character.style.setProperty('--balance-character-y', `${characterY}px`)
      character.style.setProperty('--balance-character-scale', String(characterScale))
      character.style.setProperty('--balance-lean', `${lean}deg`)
      character.style.setProperty('--balance-step-duration', `${stepDuration}ms`)
      character.classList.toggle('balance-character--moving', walking && visualProgress < 0.975)
      character.classList.toggle(
        'balance-character--straining',
        scoringActive && snapshot.pitchPresent && snapshot.speed > 0.05 && snapshot.speed < 0.55,
      )
      character.classList.toggle(
        'balance-character--wobbling',
        scoringActive && snapshot.pitchPresent && snapshot.speed <= 0.05,
      )
      character.classList.toggle(
        'balance-character--arrived',
        (completing || resting) && visualProgress >= 0.96,
      )
      scene.style.setProperty('--balance-progress', String(visualProgress))
      // Reveal the rope from the near anchor up to the character. Progress is
      // accumulated balanced time, so holding the note literally builds the
      // path forward instead of merely filling a detached progress bar.
      scene.style.setProperty('--balance-rope-clip', `${Math.max(0, ropeY - 2)}%`)
      scene.style.setProperty('--balance-camera-x', `${cameraX}px`)
      scene.style.setProperty('--balance-camera-y', `${cameraY}px`)
      scene.style.setProperty('--balance-destination-scale', String(0.88 + visualProgress * 0.38))
      scene.style.setProperty('--balance-drift-left', `${(travel % 96) * -0.018}px`)
      scene.style.setProperty('--balance-drift-right', `${(travel % 96) * 0.025}px`)
      scene.style.setProperty('--balance-parallax-far', `${visualProgress * sceneHeight * 0.012 + (travel % 96) * 0.018}px`)
      scene.style.setProperty('--balance-parallax-mid', `${visualProgress * sceneHeight * 0.03 + (travel % 96) * 0.035}px`)
      scene.style.setProperty('--balance-parallax-near', `${visualProgress * sceneHeight * 0.06 + (travel % 96) * 0.055}px`)
      scene.style.setProperty('--balance-start-shift', `${visualProgress * sceneHeight * 0.11}px`)
      scene.style.setProperty('--balance-rope-shift', `${(travel % 96) * -0.2}px`)
      scene.style.setProperty('--balance-speed', String(snapshot.speed))
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      resizeObserver.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [prefersReducedMotion, visualRef])

  const toleranceRatio =
    (Math.max(3, Math.min(30, toleranceCents)) - 3) / (30 - 3)
  const ropeLineWidth = 3.75 + toleranceRatio * 8.25

  return (
    <div
      ref={sceneRef}
      className="balance-scene"
      data-phase={phase}
      data-target={target?.writtenLabel ?? ''}
      style={{
        ['--balance-rope-line-width' as string]: ropeLineWidth.toFixed(2),
        ['--balance-rope-shadow-width' as string]: (ropeLineWidth + 2.2).toFixed(2),
        ['--balance-rope-twist-width' as string]: Math.max(1.8, ropeLineWidth * 0.42).toFixed(2),
      }}
      aria-hidden
    >
      <div className="balance-scene__sky">
        <span className="balance-sky-glow" />
        <span className="balance-cloud-cluster balance-cloud-cluster--one" />
        <span className="balance-cloud-cluster balance-cloud-cluster--two" />
        <span className="balance-cloud-cluster balance-cloud-cluster--three" />
        <span className="balance-cloud-cluster balance-cloud-cluster--four" />
        <span className="balance-cloud-bank balance-cloud-bank--far" />
        <span className="balance-cloud-bank balance-cloud-bank--mid" />
        <span className="balance-cloud-bank balance-cloud-bank--near" />
      </div>
      <div className="balance-scene__world">
        <div className="balance-floating-island balance-floating-island--left">
          <span className="balance-floating-island__base" />
          <span className="balance-floating-island__deck" />
          <span className="balance-music-flag"><i /><b>♪</b></span>
        </div>
        <div className="balance-floating-island balance-floating-island--center">
          <span className="balance-floating-island__base" />
          <span className="balance-floating-island__deck" />
          <span className="balance-music-flag"><i /><b>♪</b></span>
        </div>
        <div className="balance-floating-island balance-floating-island--high">
          <span className="balance-floating-island__base" />
          <span className="balance-floating-island__deck" />
          <span className="balance-music-flag"><i /><b>♪</b></span>
        </div>
        <div className="balance-floating-island balance-floating-island--right">
          <span className="balance-floating-island__base" />
          <span className="balance-floating-island__deck" />
        </div>

        <span className="balance-cloud-mound balance-cloud-mound--one" />
        <span className="balance-cloud-mound balance-cloud-mound--two" />
        <span className="balance-cloud-mound balance-cloud-mound--three" />
        <span className="balance-cloud-mound balance-cloud-mound--four" />
        <span className="balance-cloud-mound balance-cloud-mound--five" />
        <span className="balance-cloud-mound balance-cloud-mound--six" />
        <span className="balance-cloud-mound balance-cloud-mound--seven" />

        <svg className="balance-rope balance-rope--guide" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M20 100 C35 67 55 30 75 0" />
        </svg>
        <svg className="balance-rope balance-rope--live" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path className="balance-rope__shadow" d="M20 100 C35 67 55 30 75 0" />
          <path className="balance-rope__line" d="M20 100 C35 67 55 30 75 0" />
          <path className="balance-rope__twist" d="M20 100 C35 67 55 30 75 0" />
        </svg>

        <div className="balance-destination-island">
          <span className="balance-destination-island__base" />
          <span className="balance-destination-island__clouds"><i /><i /><i /><i /><i /></span>
          <span className="balance-destination-island__deck" />
          <span className="balance-destination-post balance-destination-post--left" />
          <span className="balance-destination-post balance-destination-post--right" />
          <span className="balance-music-flag balance-music-flag--destination"><i /><b>♪</b></span>
        </div>

        <div className="balance-start-island">
          <span className="balance-start-island__base" />
          <span className="balance-start-island__clouds" />
          <span className="balance-start-island__deck" />
          <span className="balance-anchor-post" />
        </div>

        <BalanceCharacter ref={characterRef} active={active} characterId={characterId} />
      </div>
    </div>
  )
}
