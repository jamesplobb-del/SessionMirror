import { useEffect, useRef, useState } from 'react'
import { SCENE_MS, TUTORIAL_DEMOS, type DemoShape, type TutorialId } from './tutorialDemos'
import './tutorial-demo.css'

/**
 * Plays one tutorial demo.
 *
 * Scenes hold, then cross-fade, and a finger travels to whatever the scene is
 * pointing at. Everything is percentages inside one stage, so the same demo
 * reads correctly in a 304px tip card and in the wider Settings sheet.
 *
 * It stops when it is off screen and when the player has asked for less motion,
 * because this is decoration for a tip that is also written in words — it must
 * never be the only way to get the information, and it must never be a timer
 * running behind a closed sheet.
 */
export default function TutorialDemo({ id, playing = true }: { id: TutorialId; playing?: boolean }) {
  const demo = TUTORIAL_DEMOS[id]
  const [scene, setScene] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(true)
  const reduced = useReducedMotion()

  useEffect(() => { setScene(0) }, [id])

  useEffect(() => {
    const element = stageRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => setOnScreen(entries.some(entry => entry.isIntersecting)),
      { threshold: 0.2 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const running = playing && onScreen && !reduced && demo.scenes.length > 1
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(
      () => setScene(current => (current + 1) % demo.scenes.length),
      SCENE_MS,
    )
    return () => window.clearInterval(timer)
  }, [demo.scenes.length, running])

  const current = demo.scenes[Math.min(scene, demo.scenes.length - 1)]

  return (
    <div className="tutorial-demo">
      <div ref={stageRef} className="tutorial-demo__stage" aria-hidden>
        {current.shapes.map((shape, index) => (
          <Shape key={`${scene}:${index}`} shape={shape} />
        ))}
        {current.tap && (
          <span
            className="tutorial-demo__finger"
            key={`finger:${scene}`}
            style={{ left: `${current.tap.x}%`, top: `${current.tap.y}%` }}
          />
        )}
      </div>

      {/*
        * The caption is the demo's text track: a screen reader gets the whole
        * sequence at once rather than one line every two seconds, which would
        * interrupt itself forever.
        */}
      <p className="tutorial-demo__caption" aria-hidden>{current.caption}</p>
      <p className="sr-only">
        {demo.scenes.map(item => item.caption).join(' ')}
      </p>

      {demo.scenes.length > 1 && (
        <div className="tutorial-demo__dots" role="tablist" aria-label={`${demo.title} steps`}>
          {demo.scenes.map((item, index) => (
            <button
              key={item.caption}
              type="button"
              role="tab"
              aria-selected={index === scene}
              aria-label={`Step ${index + 1}: ${item.caption}`}
              className={index === scene ? 'is-on' : undefined}
              onClick={() => setScene(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Shape({ shape }: { shape: DemoShape }) {
  return (
    <span
      className={`tutorial-demo__shape tutorial-demo__shape--${shape.kind}${shape.focus ? ' is-focus' : ''}`}
      style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.w}%`, height: `${shape.h}%` }}
    >
      {shape.label && <span>{shape.label}</span>}
    </span>
  )
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
