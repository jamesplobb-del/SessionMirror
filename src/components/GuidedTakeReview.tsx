import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { PremiumMotionDiv, PremiumMotionSection } from './ui/PremiumMotionSurface'
import { premiumMotion } from '../utils/premiumMotion'
import '../styles/premium-recording.css'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Mic, Square, X } from 'lucide-react'
import { PRACTICE_FOCUSES, matchSpokenPracticeFocus } from '../utils/practiceGoals'
import { subscribeTakeBoxCompletion } from '../utils/nativeInlineTakeBoxPlayback'
import { startSpokenFeedback, stopSpokenFeedback } from '../utils/spokenFeedback'
import '../styles/guided-take-review.css'

interface GuidedTakeReviewProps {
  takeId: string
  initialNote: string
  focus: string | null
  mode: 'audio' | 'video'
  playbackActive?: boolean
  voiceEnabled?: boolean
  audioShowBoth?: boolean
  onToggleAudioView?: () => void
  onFocusChange: (focus: string | null) => void
  onSaveNote: (takeId: string, note: string) => void
  onRecordAgain: () => void
  onCompare?: () => void
  recordDisabled: boolean
}

/** Reflection is an invitation beside the take, not another screen to get past. */
export default function GuidedTakeReview({
  takeId, initialNote, focus, mode, playbackActive = false, voiceEnabled = true,
  audioShowBoth = false, onToggleAudioView,
  onFocusChange, onSaveNote, onRecordAgain, onCompare, recordDisabled,
}: GuidedTakeReviewProps) {
  const [open, setOpen] = useState(false)
  const [heard, setHeard] = useState(false)
  const reduced = useReducedMotion()
  const [localPlaying, setLocalPlaying] = useState(false)
  const [note, setNote] = useState(initialNote)
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const noteRef = useRef(note)
  const savedNoteRef = useRef(initialNote)
  const saveNoteRef = useRef(onSaveNote)
  const listeningRef = useRef(false)
  saveNoteRef.current = onSaveNote
  noteRef.current = note
  useEffect(() => {
    const complete = (tone: 'current' | 'best') => {
      if (tone === 'current') setHeard(true)
    }
    const played = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) setLocalPlaying(true)
    }
    const paused = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) setLocalPlaying(false)
    }
    const ended = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) {
        setLocalPlaying(false)
        setHeard(true)
      }
    }
    const unsubscribe = subscribeTakeBoxCompletion(complete)
    document.addEventListener('play', played, true)
    document.addEventListener('pause', paused, true)
    document.addEventListener('ended', ended, true)
    return () => {
      unsubscribe()
      document.removeEventListener('play', played, true)
      document.removeEventListener('pause', paused, true)
      document.removeEventListener('ended', ended, true)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (noteRef.current !== savedNoteRef.current) {
        savedNoteRef.current = noteRef.current
        saveNoteRef.current(takeId, noteRef.current)
      }
    }, 550)
    return () => window.clearTimeout(timer)
  }, [note, takeId])

  useEffect(() => () => {
    if (noteRef.current !== savedNoteRef.current) saveNoteRef.current(takeId, noteRef.current)
    if (listeningRef.current) void stopSpokenFeedback()
  }, [takeId])

  const setListeningState = (value: boolean) => {
    listeningRef.current = value
    setListening(value)
  }
  const commitNote = () => {
    if (noteRef.current === savedNoteRef.current) return
    savedNoteRef.current = noteRef.current
    saveNoteRef.current(takeId, noteRef.current)
  }
  const close = () => {
    commitNote()
    if (listeningRef.current) void stopSpokenFeedback()
    setListeningState(false)
    setOpen(false)
  }
  const beginRecording = () => {
    close()
    onRecordAgain()
  }
  useEffect(() => {
    if (!open) return
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== sheetRef.current?.parentElement)
    const inert = siblings.map(node => node.inert)
    siblings.forEach(node => { node.inert = true })
    headingRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input') ?? [])
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = oldOverflow
      siblings.forEach((node, index) => { node.inert = inert[index] })
      document.removeEventListener('keydown', onKeyDown)
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])
  const toggleVoice = async () => {
    if (listeningRef.current) {
      setListeningState(false)
      await stopSpokenFeedback()
      return
    }
    setVoiceError('')
    setListeningState(true)
    try {
      await startSpokenFeedback({
        onTranscript: (transcript, isFinal) => {
          if (!isFinal || !transcript.trim()) return
          const spokenFocus = matchSpokenPracticeFocus(transcript)
          if (spokenFocus) onFocusChange(spokenFocus)
          else setNote((current) => [current.trim(), transcript.trim()].filter(Boolean).join(' · ').slice(0, 240))
          setListeningState(false)
        },
        onError: (message) => { setVoiceError(message); setListeningState(false) },
        onEnd: () => setListeningState(false),
      })
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Voice input is unavailable.')
      setListeningState(false)
    }
  }

  const noteId = `guided-note-${takeId}`
  const focusId = `guided-focus-${takeId}`
  const customFocus = focus && !PRACTICE_FOCUSES.includes(focus as typeof PRACTICE_FOCUSES[number]) ? focus : ''

  return <>
    <div className={`guided-reflection-entry guided-reflection-entry--${mode}${playbackActive || localPlaying ? ' guided-reflection-entry--playing' : ''}`}>
      <button ref={triggerRef} type="button" className="guided-reflection-entry__button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}>
        <span className="guided-reflection-entry__mark" aria-hidden="true">{focus ? <Check size={14} /> : '↗'}</span>
        <span className="guided-reflection-entry__copy"><strong>{focus ? `Next take · ${focus}` : heard ? 'What stood out?' : 'Listen, then reflect'}</strong><small>{focus ? 'Tap to change your focus' : 'A note or focus is optional'}</small></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      {mode === 'audio' && onToggleAudioView && <button type="button" className="guided-reflection-entry__view" onClick={onToggleAudioView}
        aria-label={audioShowBoth ? 'Focus on current take' : 'Show both takes'}>{audioShowBoth ? 'Focus take' : 'Both takes'}</button>}
    </div>
    {createPortal(<AnimatePresence>{open && <PremiumMotionDiv className="guided-reflection-modal" role="presentation" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={premiumMotion({duration:.1}, 'backdrop')}>
      <button type="button" className="guided-reflection-modal__scrim" aria-label="Close reflection" onClick={close} />
      <PremiumMotionSection initial={{y:reduced?0:42,scale:reduced?1:.98}} animate={{y:0,scale:1}} exit={{y:reduced?0:24,scale:reduced?1:.985}} transition={premiumMotion({duration:.1}, 'panel')} ref={sheetRef} className="guided-reflection-sheet" role="dialog" aria-modal="true" aria-labelledby={`guided-title-${takeId}`}>
        <div className="guided-reflection-sheet__handle" aria-hidden="true" />
        <header className="guided-reflection-sheet__header">
          <div><span className="guided-reflection-sheet__eyebrow">AFTER THE TAKE</span><h2 id={`guided-title-${takeId}`} ref={headingRef} tabIndex={-1}>What stood out?</h2></div>
          <button type="button" className="guided-reflection-sheet__close" aria-label="Close reflection" onClick={close}><X size={19} /></button>
        </header>
        <p className="guided-reflection-sheet__intro">Add a note, or choose one thing to try next.</p>
        <div className="guided-reflection-sheet__note-head"><label htmlFor={noteId}>Your note <span>optional</span></label>
          <button type="button" className="guided-reflection-sheet__voice" aria-label={voiceEnabled ? listening ? 'Stop voice note' : 'Speak a note or focus' : 'Voice input is available in the app'} aria-pressed={listening}
            disabled={!voiceEnabled} onClick={() => void toggleVoice()}>
            {listening ? <Square size={16} /> : <Mic size={17} />}{listening ? 'Listening' : 'Speak'}
          </button>
        </div>
        <textarea id={noteId} rows={3} maxLength={240} value={note} placeholder="Anything you want to remember…"
          onChange={(event) => setNote(event.target.value)} onBlur={commitNote} />
        {listening && <p className="guided-reflection-sheet__status" role="status">Say “posture” to choose a focus, or speak a note.</p>}
        {voiceError && <p className="guided-reflection-sheet__error" role="alert">{voiceError}</p>}
        <div className="guided-reflection-sheet__focus-head"><h3 id={focusId}>For the next take</h3><span>optional</span></div>
        <div className="guided-reflection-sheet__focuses" role="group" aria-labelledby={focusId}>
          {PRACTICE_FOCUSES.map((option) => <button key={option} type="button" aria-pressed={focus === option}
            onClick={() => onFocusChange(focus === option ? null : option)}>{focus === option && <Check size={13} />}{option}</button>)}
        </div>
        <label className="guided-reflection-sheet__custom-label" htmlFor={`guided-custom-${takeId}`}>Something else</label>
        <input id={`guided-custom-${takeId}`} className="guided-reflection-sheet__custom" maxLength={32} value={customFocus}
          placeholder="Your own focus" onChange={(event) => onFocusChange(event.target.value.trimStart() || null)} />
        <div className="guided-reflection-sheet__actions">
          <button type="button" className="guided-reflection-sheet__done" onClick={close}>Done</button>
          {onCompare && <button type="button" className="guided-reflection-sheet__compare" onClick={() => { close(); onCompare() }}>Compare takes</button>}
          <button type="button" className="guided-reflection-sheet__record" disabled={recordDisabled} onClick={beginRecording}><span aria-hidden="true" />Record again</button>
        </div>
      </PremiumMotionSection>
    </PremiumMotionDiv>}</AnimatePresence>, document.body)}
  </>
}

export function GuidedRecordingCue({ focus }: { focus: string | null }) {
  return focus ? <div className="guided-recording-cue" role="status" aria-label={`Focus for this take: ${focus}`}><span>Focus</span><strong>{focus}</strong></div> : null
}
