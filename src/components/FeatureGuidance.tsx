import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PremiumStatusToast } from './ui/PremiumRecordingFeedback'
import {
  createGuidanceState, FEATURE_GUIDES, GUIDANCE_EVENT, GUIDANCE_PREFERENCES_EVENT, CONFIRMATION_EVENT,
  guidanceReducer, readGuidancePreferences, writeGuidancePreferences, setFeatureTipsEnabled,
  type FeatureAction, type FeatureGuideId,
} from '../utils/featureGuidance'
import '../styles/feature-guidance.css'

interface Props {
  surface?: 'recording' | 'music' | 'other'
  recordingReady?: boolean
  hasTakes?: boolean
  paused: boolean
  feedbackPaused: boolean
  workspaceOpen: boolean
  handsFreeEnabled: boolean
  isRecording: boolean
  recordingActivity?: string | null
  feedbackError?: string | null
  onDismissFeedbackError?: () => void
}
/** How long a tip's target may be missing before the tip hides. */
const TARGET_LOST_HIDE_MS = 1200
const FLASH_WINDOW_MS = 4000
const FLASH_FLIP_LIMIT = 6

interface Position { left: number; top: number; width: number; maxHeight: number; target: DOMRect }

/** Never scroll the app or cover the control being explained. */
function findTarget(selector: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return Boolean(hit && element.contains(hit)) && !element.closest('[inert], [aria-hidden="true"]') && style.visibility !== 'hidden' &&
      style.display !== 'none' && Number(style.opacity) > 0 && rect.width > 12 && rect.height > 12 &&
      // Sub-pixel layout can put a control flush with the screen edge a fraction
      // of a pixel past it; that control is still fully visible.
      rect.top >= -2 && rect.bottom <= window.innerHeight + 2 && rect.right > 0 && rect.left < window.innerWidth
  })
}

function positionCard(target: DOMRect, height: number): Position | null {
  const viewport = window.visualViewport
  const leftEdge = (viewport?.offsetLeft ?? 0) + 16
  const rootStyle = getComputedStyle(document.documentElement)
  const safeTop = parseFloat(rootStyle.getPropertyValue('--feature-guide-safe-top')) || 0
  const safeBottom = parseFloat(rootStyle.getPropertyValue('--feature-guide-safe-bottom')) || 0
  const topEdge = (viewport?.offsetTop ?? 0) + safeTop + 16
  const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 32
  const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - safeBottom - 16
  const width = Math.min(304, rightEdge - leftEdge)
  const gap = 14
  const left = Math.max(leftEdge, Math.min(rightEdge - width, target.left + target.width / 2 - width / 2))
  const above = target.top - gap - topEdge
  const below = bottomEdge - target.bottom - gap
  if (above >= height) return { left, top: target.top - gap - height, width, maxHeight: above, target }
  if (below >= height) return { left, top: target.bottom + gap, width, maxHeight: below, target }
  if (target.left - leftEdge >= width + gap || rightEdge - target.right >= width + gap) {
    return { left: target.left - leftEdge >= width + gap ? target.left - width - gap : target.right + gap,
      top: Math.max(topEdge, Math.min(bottomEdge - height, target.top)), width,
      maxHeight: bottomEdge - topEdge, target }
  }
  const available = Math.max(above, below)
  if (available < 140) return null
  return { left, top: above >= below ? topEdge : target.bottom + gap, width, maxHeight: available, target }
}

export default function FeatureGuidance(props: Props) {
  const [state, dispatch] = useReducer(guidanceReducer, undefined, createGuidanceState)
  const [position, setPosition] = useState<Position | null>(null)
  const [confirmation, setConfirmation] = useState<{ text: string; expires: number } | null>(null)
  const [now, setNow] = useState(Date.now)
  const [documentHidden, setDocumentHidden] = useState(document.hidden)
  const cardRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ state, props })
  latest.current = { state, props }
  const previousFocus = useRef<HTMLElement | null>(null)
  const lastConfirmation = useRef({ text: '', time: 0 })
  const active = state.active
  const step = active ? FEATURE_GUIDES[active.id][active.step] : null
  const paused = props.paused || documentHidden ||
    (active?.id === 'hands-free' && (!props.handsFreeEnabled || props.workspaceOpen)) ||
    (active?.id === 'workspace' && !props.workspaceOpen) ||
    (active?.id === 'best-take' && props.workspaceOpen) ||
    (active?.id === 'music-tools' && props.surface !== 'music') ||
    (active?.id === 'recording' && (props.surface !== 'recording' || props.workspaceOpen)) ||
    (active?.id === 'multitrack' && !props.workspaceOpen)
  const visible = Boolean(active && step && position && !paused)
  const toastVisible = Boolean(confirmation && confirmation.expires > now && !visible &&
    !props.feedbackPaused && !documentHidden)

  useEffect(() => { writeGuidancePreferences(state.preferences) }, [state.preferences])

  useEffect(() => {
    const onPreferences = (event: Event) => dispatch({ type: 'preferences',
      preferences: readGuidancePreferences(), reset: (event as CustomEvent).detail === 'reset' })
    const onVisibility = () => setDocumentHidden(document.hidden)
    const confirm = (text: string) => {
      const time = Date.now()
      if (lastConfirmation.current.text === text && time - lastConfirmation.current.time < 4000) return
      lastConfirmation.current = { text, time }
      setNow(time)
      setConfirmation({ text, expires: time + 3200 })
    }
    const onConfirmation = (event: Event) => confirm((event as CustomEvent<string>).detail)
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<FeatureAction>).detail
      const { state: current, props: currentProps } = latest.current
      const time = Date.now()
      const request = (id: FeatureGuideId) => dispatch({ type: 'request', id, now: time })
      const learned = (id: FeatureGuideId) => dispatch({ type: 'learned', id, now: time })
      const currentStep = current.active ? FEATURE_GUIDES[current.active.id][current.active.step] : null
      if (currentStep?.action === action) dispatch({ type: 'advance', now: time })
      switch (action) {
        case 'take-saved':
          confirm('Take saved')
          learned('recording')
          request('best-take')
          request('take-library')
          if (currentProps.handsFreeEnabled) learned('hands-free')
          break
        case 'current-take-pinned':
          if (current.active?.id !== 'best-take') learned('best-take')
          break
        case 'best-take-pinned':
          confirm('Best Take updated')
          if (current.active?.id !== 'best-take') learned('best-take')
          break
        case 'take-card-transfer-completed': learned('best-take'); break
        case 'overlays-opened': request('workspace'); request('multitrack'); break
        case 'overlays-closed': learned('workspace'); break
        case 'branch-widget-selected':
          if (current.active?.id !== 'workspace') learned('workspace')
          break
        case 'hands-free-enabled': request('hands-free'); confirm('Hands-free on'); break
        case 'hands-free-disabled': learned('hands-free'); confirm('Hands-free off'); break
        case 'hands-free-settings-opened': learned('hands-free'); break
        case 'hands-free-recorded': learned('hands-free'); break
        case 'take-library-opened': learned('take-library'); break
        case 'widget-expanded': learned('workspace'); learned('music-tools'); break
        case 'tuner-input-quiet': if (!currentProps.paused) request('tuner-quiet'); break
        case 'tuner-input-loud': if (!currentProps.paused) request('tuner-loud'); break
      }
    }
    window.addEventListener(CONFIRMATION_EVENT, onConfirmation)
    window.addEventListener(GUIDANCE_EVENT, onAction)
    window.addEventListener(GUIDANCE_PREFERENCES_EVENT, onPreferences)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(CONFIRMATION_EVENT, onConfirmation)
      window.removeEventListener(GUIDANCE_EVENT, onAction)
      window.removeEventListener(GUIDANCE_PREFERENCES_EVENT, onPreferences)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (props.paused || (props.surface === 'recording' && !props.recordingReady)) return
    const id: FeatureGuideId | null = props.surface === 'music' ? 'music-tools'
      : props.surface === 'recording' ? (props.hasTakes ? 'navigation' : 'recording') : null
    if (!id) return
    dispatch({ type: 'request', id, now: Date.now() })
  }, [props.paused, props.recordingReady, props.surface, props.hasTakes])

  useEffect(() => {
    if (props.isRecording) dispatch({ type: 'learned', id: 'recording', now: Date.now() })
  }, [props.isRecording])

  useEffect(() => {
    if (props.isRecording && props.handsFreeEnabled) dispatch({ type: 'learned', id: 'hands-free', now: Date.now() })
  }, [props.isRecording, props.handsFreeEnabled])

  useEffect(() => {
    if (!confirmation) return
    const timer = window.setTimeout(() => setConfirmation(null), Math.max(0, confirmation.expires - Date.now()))
    return () => window.clearTimeout(timer)
  }, [confirmation])

  useEffect(() => {
    if (paused || active || !state.preferences.enabled || !state.pending.length) return
    const considerGuide = () => {
      const time = Date.now()
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      dispatch({ type: 'expire', now: time })
      // A saved take's guide is its immediate next step; other confirmations
      // get a brief moment before teaching resumes.
      if (confirmation && confirmation.expires > time &&
        !state.pending.some(item => item.id === 'best-take')) return
      const candidate = state.pending.find(item => {
        if (item.expires <= time ||
          (item.id === 'music-tools' && props.surface !== 'music') ||
          (item.id === 'recording' && (props.surface !== 'recording' || props.workspaceOpen)) ||
          (item.id === 'multitrack' && !props.workspaceOpen) ||
          (item.id === 'workspace' && !props.workspaceOpen) ||
          (item.id === 'hands-free' && (!props.handsFreeEnabled || props.workspaceOpen))) return false
        const target = findTarget(FEATURE_GUIDES[item.id][0].selector)
        return target && positionCard(target.getBoundingClientRect(), 202)
      })
      if (candidate) dispatch({ type: 'start', id: candidate.id, now: time })
    }
    considerGuide()
    const retry = window.setInterval(considerGuide, 300)
    return () => window.clearInterval(retry)
  }, [paused, active, state.pending, state.preferences.enabled, props.workspaceOpen, props.handsFreeEnabled, props.surface, confirmation])

  useLayoutEffect(() => {
    setPosition(null)
    if (!step || !active || paused) return
    let missingSince: number | null = null
    let placed = false
    const update = () => {
      if (Date.now() > active.expires) { dispatch({ type: 'dismiss', now: Date.now() }); return }
      const target = findTarget(step.selector)
      // Measure only a placed card: an unplaced one has no width, wraps
      // differently and would feed back a different height every tick.
      const height = placed ? Math.max(cardRef.current?.scrollHeight ?? 0, 202) : 202
      const next = target ? positionCard(target.getBoundingClientRect(), height) : null
      if (next) {
        missingSince = null
        placed = true
        setPosition(current => (current && Math.abs(current.left - next.left) < 1 && Math.abs(current.top - next.top) < 1 &&
          current.width === next.width && Math.abs(current.target.top - next.target.top) < 1 &&
          Math.abs(current.target.left - next.target.left) < 1 ? current : next))
        return
      }
      // A target that blinks out for a moment (an animation, a sheet passing
      // over it) must not hide and re-show the card: that is the flashing.
      const now = Date.now()
      missingSince ??= now
      if (!placed || now - missingSince >= TARGET_LOST_HIDE_MS) { placed = false; setPosition(null) }
    }
    update()
    const observer = new ResizeObserver(update)
    if (cardRef.current) observer.observe(cardRef.current)
    const interval = window.setInterval(update, 350)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect(); window.clearInterval(interval)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [step, active, paused])

  // Last line of defence against a strobing tip: if the card keeps appearing
  // and disappearing, retire it for good rather than flash at the player.
  const flips = useRef<number[]>([])
  useEffect(() => {
    if (!active) { flips.current = []; return }
    const now = Date.now()
    flips.current = [...flips.current.filter(time => now - time < FLASH_WINDOW_MS), now]
    if (flips.current.length > FLASH_FLIP_LIMIT) {
      flips.current = []
      dispatch({ type: 'dismiss', now })
    }
  }, [visible, active])

  useEffect(() => {
    if (!visible) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !cardRef.current?.contains(target)) dispatch({ type: 'dismiss', now: Date.now() })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      dispatch({ type: 'dismiss', now: Date.now() })
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('pointerdown', onPointerDown, true) }
  }, [visible])

  const advance = (skip: boolean) => {
    const closing = skip || (active && active.step === FEATURE_GUIDES[active.id].length - 1)
    if (closing && cardRef.current?.contains(document.activeElement)) previousFocus.current?.focus({ preventScroll: true })
    dispatch({ type: skip ? 'dismiss' : 'advance', now: Date.now() })
  }

  return createPortal(<>
    <div className="feature-guidance-announcement" role="status" aria-live="polite" aria-atomic="true">
      {visible && step ? `${step.title}. ${step.body}` : ''}
    </div>
    {active && step && <div className="feature-guidance-layer" hidden={!visible}>
      {position && <div className="feature-guidance-target" aria-hidden="true" style={{
        left: position.target.left - 5, top: position.target.top - 5,
        width: position.target.width + 10, height: position.target.height + 10,
      }} />}
      <div ref={cardRef} className="feature-guidance-card" role="region"
        aria-labelledby="feature-guidance-title" aria-describedby="feature-guidance-body"
        style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight } : undefined}>
        {FEATURE_GUIDES[active.id].length > 1 && <span className="feature-guidance-progress">{active.step + 1} of {FEATURE_GUIDES[active.id].length}</span>}
        <h2 id="feature-guidance-title">{step.title}</h2>
        <p id="feature-guidance-body">{step.body}</p>
        <div className="feature-guidance-actions">
          <button type="button" onClick={() => advance(true)}>{FEATURE_GUIDES[active.id].length > 1 ? 'Skip' : 'Dismiss'}</button>
          <button type="button" className="feature-guidance-next" onClick={() => advance(false)}>
            {active.step === FEATURE_GUIDES[active.id].length - 1 ? 'Got it' : 'Next'}
          </button>
        </div>
        <button type="button" className="feature-guidance-disable" onClick={() => setFeatureTipsEnabled(false)}>Don’t show tips</button>
      </div>
    </div>}
    <PremiumStatusToast
      message={documentHidden ? null : props.feedbackError || props.recordingActivity || (toastVisible ? confirmation?.text ?? null : null)}
      tone={props.feedbackError ? 'error' : props.recordingActivity ? 'busy' : 'success'}
      onDismiss={props.feedbackError ? props.onDismissFeedbackError : undefined} />
  </>, document.body)
}
