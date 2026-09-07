import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Minus,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import RoutineReferenceSetup from './RoutineReferenceSetup'
import RoutineProgramSetup from './RoutineProgramSetup'
import { iosFade } from '../utils/motionPresets'
import {
  INSTRUMENT_FAMILIES,
  getInstrumentProfile,
  getInstrumentProfilesByFamily,
} from '../utils/instrumentProfiles'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../utils/tunerTransposition'
import { summarizeDesk, type DeskSnapshot } from '../utils/workspaceDesks'
import {
  KIND_LABEL,
  MAX_ROUTINE_NAME,
  MAX_ROUTINE_STEPS,
  MAX_STEP_TITLE,
  blankDesk,
  clampMinutes,
  createRoutine,
  createStep,
  formatMinutes,
  summarizeStep,
  type Routine,
  type RoutineStep,
  type RoutineStepKind,
} from '../utils/practiceRoutines'
import {
  buildPresetRoutine,
  getRoutinePresets,
  getStepTemplates,
  homePitchClass,
  presetMinutes,
  stepFromTemplate,
} from '../utils/routinePresets'
import type { LabsRoute } from './labs/LabsOverlay'
import type { Project } from '../db'

/** How the hub was asked to open the builder. */
export type RoutineBuilderMode = 'build' | 'presets' | 'edit'

/** A focus step that still needs a practice item. */
export interface RoutineFocusRequest {
  stepId: string
  title: string
}

export interface RoutineBuilderProps {
  mode: RoutineBuilderMode
  routine: Routine | null
  instrumentId: string | null
  projects: Project[]
  liveDeskSnapshot: DeskSnapshot
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onSave: (routine: Routine) => void
  onDelete: () => void
  onCancel: () => void
  /** Lets the hub swap its header title and back arrow. */
  onViewChange?: (view: BuilderView) => void
}

export type BuilderView = 'presets' | 'edit' | 'add' | 'step'

const KINDS = ['tune', 'metro', 'audio', 'video', 'game', 'free'] as const
const GAMES: Array<{ route: LabsRoute; label: string; hint: string }> = [
  { route: 'staff-jumper', label: 'Staff Jumper', hint: 'Sight-reading' },
  { route: 'balance', label: 'Balance', hint: 'Hold the centre' },
  { route: 'learn-instrument', label: 'Learn', hint: 'Fingerings' },
  { route: 'menu', label: 'Pick each time', hint: 'Opens the games menu' },
]

const KIND_HINT: Record<RoutineStepKind, string> = {
  tune: 'Opens the Tuner. A drone or click can come with it.',
  metro: 'Opens the Metronome with the click running.',
  record: 'Opens the recorder. Audio or camera, hands-free if you like.',
  focus: 'Opens your recorder with this item’s saved reference and takes.',
  game: 'Opens one of the practice games.',
  free: 'Just a line on the list. Nothing opens.',
}

function kindNeedsDesk(kind: RoutineStepKind): boolean {
  return kind !== 'game' && kind !== 'free'
}

export default function RoutineBuilder({
  mode,
  routine,
  instrumentId: instrumentIdProp,
  projects,
  liveDeskSnapshot,
  tunerTransposition,
  hapticFeedback,
  onSave,
  onDelete,
  onCancel,
  onViewChange,
}: RoutineBuilderProps) {
  const [view, setView] = useState<BuilderView>(() =>
    mode === 'presets' ? 'presets' : 'edit',
  )
  const [instrumentId, setInstrumentId] = useState<string | null>(
    routine?.instrumentId ?? instrumentIdProp,
  )
  const [draft, setDraft] = useState<Routine>(() =>
    mode === 'edit' && routine
      ? routine
      : createRoutine('Daily routine', [], routine?.instrumentId ?? instrumentIdProp),
  )
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState('')

  useEffect(() => {
    onViewChange?.(view)
  }, [onViewChange, view])

  const templates = useMemo(() => getStepTemplates(instrumentId), [instrumentId])
  const presets = useMemo(() => getRoutinePresets(instrumentId), [instrumentId])
  const editingStep = draft.steps.find((step) => step.id === editingStepId) ?? null
  const totalMinutes = draft.steps.reduce((sum, step) => sum + step.minutes, 0)

  const updateStep = (stepId: string, patch: Partial<RoutineStep>) => {
    setDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      steps: current.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }))
  }

  const addStep = (step: RoutineStep) => {
    if (draft.steps.length >= MAX_ROUTINE_STEPS) return
    setDraft((current) => ({ ...current, updatedAt: Date.now(), steps: [...current.steps, step] }))
    setEditingStepId(step.id)
    setView('step')
  }

  const removeStep = (stepId: string) => {
    setDraft((current) => ({
      ...current,
      updatedAt: Date.now(),
      steps: current.steps.filter((step) => step.id !== stepId),
    }))
    setEditingStepId(null)
    setView('edit')
  }

  const moveStep = (stepId: string, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.steps.findIndex((step) => step.id === stepId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.steps.length) return current
      const steps = [...current.steps]
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...current, updatedAt: Date.now(), steps }
    })
  }

  const usePreset = (presetId: 'quick' | 'standard') => {
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return
    const built = buildPresetRoutine(preset, instrumentId)
    setDraft(routine && mode === 'edit' ? { ...built, id: routine.id, createdAt: routine.createdAt } : built)
    setView('edit')
  }

  const addCurrentSetup = () => {
    const desk = liveDeskSnapshot
    const kind: RoutineStepKind = 'record'
    addStep(
      createStep({
        title: 'What I do now',
        minutes: 5,
        kind,
        topic: 'other',
        desk,
      }),
    )
  }

  const addCustom = () => {
    const title = customTitle.trim()
    if (!title) return
    setCustomTitle('')
    addStep(createStep({ title, minutes: 5, kind: 'free', topic: 'other', desk: null }))
  }

  const save = () => {
    const steps = draft.steps.filter((step) => step.title.trim())
    if (steps.length === 0) return
    onSave({
      ...draft,
      name: draft.name.trim().slice(0, MAX_ROUTINE_NAME) || 'Daily routine',
      instrumentId,
      steps,
      updatedAt: Date.now(),
    })
  }

  const instrumentLabel = instrumentId ? getInstrumentProfile(instrumentId)?.label ?? 'Instrument' : 'Choose your instrument'

  const instrumentPicker = (
    <label className="routine-instrument">
      <span>Steps and suggestions are for</span>
      <select
        value={instrumentId ?? ''}
        onChange={(event) => setInstrumentId(event.target.value || null)}
        aria-label="Instrument"
      >
        <option value="">Any instrument</option>
        {INSTRUMENT_FAMILIES.map((family) => (
          <optgroup key={family} label={family}>
            {getInstrumentProfilesByFamily(family).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <strong>{instrumentLabel}</strong>
      <ChevronRight aria-hidden />
    </label>
  )

  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === 'presets' && (
        <motion.div
          key="presets"
          className="practice-menu-page routine-builder"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={iosFade}
        >
          <section className="practice-menu-section">
            {instrumentPicker}
            <p className="practice-menu-note">
              A starting point in the order most players use. Every step can be changed before you save.
            </p>
            <div className="routine-preset-list">
              {presets.map((preset) => {
                const previewSteps = preset.templateIds
                  .map((id) => templates.find((template) => template.id === id)?.title)
                  .filter((title): title is string => Boolean(title))
                return (
                  <Pressable
                    key={preset.id}
                    type="button"
                    intensity="soft"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    className="routine-preset"
                    onClick={() => usePreset(preset.id)}
                  >
                    <span className="routine-preset__head">
                      <strong>{preset.name}</strong>
                      <em>{formatMinutes(presetMinutes(preset, instrumentId))} · {previewSteps.length} steps</em>
                    </span>
                    <small>{preset.blurb}</small>
                    <ol>
                      {previewSteps.map((title, index) => (
                        <li key={`${preset.id}-${index}`}>{title}</li>
                      ))}
                    </ol>
                    <ChevronRight className="routine-preset__chevron" aria-hidden />
                  </Pressable>
                )
              })}
            </div>
          </section>
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            className="routine-link"
            onClick={() => setView('edit')}
          >
            Or build your own from scratch
          </Pressable>
        </motion.div>
      )}

      {view === 'edit' && (
        <motion.div
          key="edit"
          className="practice-menu-page routine-builder"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={iosFade}
        >
          <section className="practice-menu-section">
            <div className="practice-menu-form">
              <label className="practice-menu-field">
                <span>Routine name</span>
                <input
                  value={draft.name}
                  maxLength={MAX_ROUTINE_NAME}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Daily routine"
                  aria-label="Routine name"
                />
              </label>
            </div>
            {instrumentPicker}
          </section>

          <section className="practice-menu-section">
            <span className="practice-menu-eyebrow">
              Steps · {draft.steps.length}
              {totalMinutes > 0 ? ` · ${formatMinutes(totalMinutes)}` : ''}
            </span>
            {draft.steps.length === 0 ? (
              <p className="practice-menu-note">
                Nothing yet. Add the things you actually do, in the order you do them.
              </p>
            ) : (
              <ol className="routine-step-list">
                {draft.steps.map((step, index) => (
                  <li key={step.id} className="routine-step-row">
                    <span className="routine-step-row__index">{index + 1}</span>
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      hapticFeedback={hapticFeedback}
                      className="routine-step-row__main"
                      onClick={() => {
                        setEditingStepId(step.id)
                        setView('step')
                      }}
                    >
                      <strong>{step.title}</strong>
                      <small>{summarizeStep(step, tunerTransposition) || KIND_LABEL[step.kind]}</small>
                    </Pressable>
                    <span className="routine-step-row__order">
                      <Pressable
                        type="button"
                        intensity="icon"
                        haptic="light"
                        hapticFeedback={hapticFeedback}
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => moveStep(step.id, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </Pressable>
                      <Pressable
                        type="button"
                        intensity="icon"
                        haptic="light"
                        hapticFeedback={hapticFeedback}
                        aria-label="Move down"
                        disabled={index === draft.steps.length - 1}
                        onClick={() => moveStep(step.id, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </Pressable>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div className="routine-add-row">
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-add"
                disabled={draft.steps.length >= MAX_ROUTINE_STEPS}
                onClick={() => setView('add')}
              >
                <Plus aria-hidden />
                <span>Add a step</span>
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-add routine-add--now"
                disabled={draft.steps.length >= MAX_ROUTINE_STEPS}
                onClick={addCurrentSetup}
                title={summarizeDesk(liveDeskSnapshot, tunerTransposition)}
              >
                <SlidersHorizontal aria-hidden />
                <span>Add current setup</span>
              </Pressable>
            </div>
          </section>

          {presets.length > 0 && draft.steps.length === 0 && (
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="routine-link"
              onClick={() => setView('presets')}
            >
              Not sure what to do? Start from a preset
            </Pressable>
          )}

          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            className="practice-menu-primary"
            disabled={draft.steps.length === 0}
            onClick={save}
          >
            {routine && mode === 'edit' ? 'Save changes' : 'Save routine'}
          </Pressable>

          <div className="routine-footer-links">
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="routine-link"
              onClick={onCancel}
            >
              {routine ? 'Cancel' : 'Skip for now'}
            </Pressable>
            {routine && mode === 'edit' && (
              <Pressable
                type="button"
                intensity="soft"
                haptic="warning"
                hapticFeedback={hapticFeedback}
                className="routine-link routine-link--danger"
                onClick={onDelete}
              >
                Delete routine
              </Pressable>
            )}
          </div>
        </motion.div>
      )}

      {view === 'add' && (
        <motion.div
          key="add"
          className="practice-menu-page routine-builder"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={iosFade}
        >
          <section className="practice-menu-section">
            <span className="practice-menu-eyebrow">Common steps</span>
            <p className="practice-menu-note">
              Broad on purpose. Pick one and set the tools, or type your own below.
            </p>
            <div className="routine-template-list">
              {templates.map((template) => (
                <Pressable
                  key={template.id}
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className="routine-template"
                  onClick={() => addStep(stepFromTemplate(template, instrumentId))}
                >
                  <span>
                    <strong>{template.title}</strong>
                    <small>{template.hint}</small>
                  </span>
                  <em>{template.minutes} min</em>
                  <Plus aria-hidden />
                </Pressable>
              ))}
            </div>
          </section>
          <section className="practice-menu-section">
            <span className="practice-menu-eyebrow">Your own</span>
            <div className="practice-menu-form">
              <div className="practice-menu-create-item">
                <input
                  value={customTitle}
                  maxLength={MAX_STEP_TITLE}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder="Name a step — Pedal tones, Transposition…"
                  aria-label="Name a step"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addCustom()
                  }}
                />
                <button type="button" aria-label="Add step" disabled={!customTitle.trim()} onClick={addCustom}>
                  <Plus aria-hidden />
                </button>
              </div>
            </div>
          </section>
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            className="routine-link"
            onClick={() => setView('edit')}
          >
            Back to the list
          </Pressable>
        </motion.div>
      )}

      {view === 'step' && editingStep && (
        <motion.div
          key={`step-${editingStep.id}`}
          className="practice-menu-page routine-builder"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={iosFade}
        >
          <StepEditor
            key={editingStep.id}
            step={editingStep}
            instrumentId={instrumentId}
            projects={projects}
            tunerTransposition={tunerTransposition}
            hapticFeedback={hapticFeedback}
            onChange={(patch) => updateStep(editingStep.id, patch)}
            onRemove={() => removeStep(editingStep.id)}
            onDone={() => {
              setEditingStepId(null)
              setView('edit')
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---- Step editor ---------------------------------------------------------- */

interface StepEditorProps {
  step: RoutineStep
  instrumentId: string | null
  projects: Project[]
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onChange: (patch: Partial<RoutineStep>) => void
  onRemove: () => void
  onDone: () => void
  toolsOnly?: boolean
  onToolsDone?: () => void
  onBackToOpening?: () => void
  initialPage?: 'item' | 'tools'
  footerTarget?: HTMLElement | null
}

export function StepEditor({
  step,
  instrumentId,
  tunerTransposition,
  hapticFeedback,
  onChange,
  onRemove,
  onDone,
  footerTarget,
  initialPage = 'item',
  toolsOnly = false,
  onToolsDone,
  onBackToOpening,
}: StepEditorProps) {
  const desk = step.desk ?? blankDesk('audio')
  const [page, setPage] = useState<'item' | 'tools' | 'reference'>(initialPage)
  const pageHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    pageHeading.current?.focus({ preventScroll: true })
    pageHeading.current?.scrollIntoView({ block: 'nearest' })
  }, [page])


  const patchDesk = (patch: Partial<DeskSnapshot>) => {
    onChange({ desk: { ...desk, ...patch } })
  }

  const setKind = (kind: RoutineStepKind) => {
    const patch: Partial<RoutineStep> = { kind }
    if (kindNeedsDesk(kind) && !step.desk) patch.desk = blankDesk('audio')
    if (kind === 'tune' || kind === 'metro') patch.desk = { ...(patch.desk ?? desk), mode: 'audio' }
    if (kind === 'metro') patch.desk = { ...(patch.desk ?? desk), showMetronome: true }
    if (kind === 'game' || kind === 'free') patch.programId = null
    if (kind === 'game' && !step.gameRoute) patch.gameRoute = 'menu'
    onChange(patch)
  }

  const droneLabel = (pitchClass: number) =>
    getWrittenPitchLabel(pitchClass, desk.drone.octave, tunerTransposition).label

  const footer = <footer className="routine-guide-footer">
    <button type="button" className="routine-guide-continue" disabled={!step.title.trim()} onClick={() => {
      if (toolsOnly) { onToolsDone?.(); return }
      if (page === 'item') setPage('tools')
      else if (page === 'tools' && kindNeedsDesk(step.kind)) setPage('reference')
      else {
        if (page === 'reference' && !step.referenceVideoId) onChange({ referenceQuery: '' })
        onDone()
      }
    }}>{page === 'item' ? 'Continue to tools' : page === 'tools' && kindNeedsDesk(step.kind) ? 'Continue to reference' : page === 'reference' && !step.referenceVideoId ? 'Skip reference & save item' : 'Save item'}<ChevronRight aria-hidden /></button>
  </footer>

  return (
    <div>
      <h3 ref={pageHeading} tabIndex={-1} className="routine-item-page-heading">{page === 'item' ? '1 · Item details' : page === 'tools' ? '2 · Tools' : '3 · Reference'}</h3>
      {page === 'item' && <>
      <section className="practice-menu-section">
        <div className="practice-menu-form">
          <label className="practice-menu-field">
            <span>Practice item</span>
            <input
              value={step.title}
              maxLength={MAX_STEP_TITLE}
              onChange={(event) => onChange({ title: event.target.value })}
              aria-label="Step name"
            />
          </label>
          <div className="practice-menu-field routine-field-row">
            <span>Length</span>
            <div className="routine-stepper" role="group" aria-label="Minutes">
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                aria-label="Less time"
                onClick={() => onChange({ minutes: clampMinutes(step.minutes - 1) })}
              >
                <Minus aria-hidden />
              </Pressable>
              <strong>{formatMinutes(step.minutes)}</strong>
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                aria-label="More time"
                onClick={() => onChange({ minutes: clampMinutes(step.minutes + 1) })}
              >
                <Plus aria-hidden />
              </Pressable>
            </div>
          </div>
        </div>
      </section>


      </>}
      {page === 'reference' && <>
        <button type="button" className="routine-link" onClick={() => setPage('tools')}>← Back to tools</button>
        <h3>Add a reference</h3>
        <p className="practice-menu-note">Optional · Find a recording to listen to and compare with your takes.</p>
        <RoutineReferenceSetup inline instrumentId={instrumentId} title={step.title}
          value={step.referenceQuery} onChange={referenceQuery => onChange({ referenceQuery })}
          videoId={step.referenceVideoId} onVideoIdChange={referenceVideoId => onChange({ referenceVideoId })} />

      </>}
      {page === 'tools' && <>
      <button type="button" className="routine-link" onClick={() => toolsOnly ? onBackToOpening?.() : setPage('item')}>← Back</button>
      {!toolsOnly && <section className="practice-menu-section routine-tools-lead">
        <span className="practice-menu-eyebrow">Opens with this item</span>
        <p className="routine-tools-lead__intro">
          Choose the workspace for this exercise.
        </p>
        <div className="routine-kind-grid" role="radiogroup" aria-label="What this step opens">
          {KINDS.map((kind) => (
            <Pressable
              key={kind}
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              role="radio"
              aria-checked={kind === 'audio' || kind === 'video' ? (step.kind === 'record' || step.kind === 'focus') && desk.mode === kind : step.kind === kind}
              className={`routine-kind ${(kind === 'audio' || kind === 'video' ? (step.kind === 'record' || step.kind === 'focus') && desk.mode === kind : step.kind === kind) ? 'is-on' : ''}`}
              onClick={() => kind === 'audio' || kind === 'video' ? onChange({ kind: 'record', desk: { ...desk, mode: kind } }) : setKind(kind)}
            >
              {kind === 'audio' ? 'Audio' : kind === 'video' ? 'Camera' : KIND_LABEL[kind]}
            </Pressable>
          ))}
        </div>
        <p className="practice-menu-note">{KIND_HINT[step.kind]}</p>
      </section>}

      {step.kind === 'game' && (
        <section className="practice-menu-section">
          <span className="practice-menu-eyebrow">Which game</span>
          <div className="practice-menu-form">
            {GAMES.map((game) => (
              <Pressable
                key={game.route}
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-option"
                aria-pressed={step.gameRoute === game.route}
                onClick={() => onChange({ gameRoute: game.route })}
              >
                <span>
                  <strong>{game.label}</strong>
                  <small>{game.hint}</small>
                </span>
                {step.gameRoute === game.route && <Check aria-hidden />}
              </Pressable>
            ))}
          </div>
        </section>
      )}


      {kindNeedsDesk(step.kind) && (
        <section className="practice-menu-section">
          <span className="practice-menu-eyebrow">Your starting setup</span>
          <p className="routine-tools-lead__intro">
            Set the tools you want ready for this exercise.
          </p>
          <div className="practice-menu-form routine-tools">
            <div className="routine-tool">
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-tool__toggle"
                role="switch"
                aria-checked={desk.showMetronome}
                onClick={() => patchDesk({ showMetronome: !desk.showMetronome })}
              >
                <strong>Metronome</strong>
                <i />
              </Pressable>
              <small className="routine-tool__hint">Keep a steady pulse at your chosen tempo.</small>
              {desk.showMetronome && (
                <div className="routine-stepper routine-stepper--wide" role="group" aria-label="Tempo">
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    aria-label="Slower"
                    onClick={() =>
                      patchDesk({ metronome: { ...desk.metronome, bpm: Math.max(30, desk.metronome.bpm - 4) } })
                    }
                  >
                    <Minus aria-hidden />
                  </Pressable>
                  <strong>♩{desk.metronome.bpm}</strong>
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    aria-label="Faster"
                    onClick={() =>
                      patchDesk({ metronome: { ...desk.metronome, bpm: Math.min(240, desk.metronome.bpm + 4) } })
                    }
                  >
                    <Plus aria-hidden />
                  </Pressable>
                  <select
                    value={desk.metronome.meter}
                    aria-label="Time signature"
                    onChange={(event) =>
                      patchDesk({
                        metronome: {
                          ...desk.metronome,
                          meter: event.target.value as DeskSnapshot['metronome']['meter'],
                        },
                      })
                    }
                  >
                    {(['2/4', '3/4', '4/4', '6/8'] as const).map((meter) => (
                      <option key={meter} value={meter}>
                        {meter}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="routine-tool">
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-tool__toggle"
                role="switch"
                aria-checked={desk.showDrone}
                onClick={() =>
                  patchDesk({
                    showDrone: !desk.showDrone,
                    drone: {
                      ...desk.drone,
                      pitchClass: desk.drone.pitchClass ?? homePitchClass(instrumentId) ?? 9,
                    },
                  })
                }
              >
                <strong>Drone</strong>
                <i />
              </Pressable>
              <small className="routine-tool__hint">A reference pitch to play against.</small>
              {desk.showDrone && (
                <div className="routine-pitch-row" role="radiogroup" aria-label="Drone note">
                  {Array.from({ length: 12 }, (_, pitchClass) => (
                    <Pressable
                      key={pitchClass}
                      type="button"
                      intensity="soft"
                      haptic="light"
                      hapticFeedback={hapticFeedback}
                      role="radio"
                      aria-checked={desk.drone.pitchClass === pitchClass}
                      className={`routine-pitch ${desk.drone.pitchClass === pitchClass ? 'is-on' : ''}`}
                      onClick={() => patchDesk({ drone: { ...desk.drone, pitchClass } })}
                    >
                      {droneLabel(pitchClass)}
                    </Pressable>
                  ))}
                </div>
              )}
            </div>

            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="routine-tool__toggle"
              role="switch"
              aria-checked={desk.pitchTrackerEnabled}
              onClick={() => patchDesk({ pitchTrackerEnabled: !desk.pitchTrackerEnabled })}
            >
              <strong>Pitch graph</strong>
              <i />
            </Pressable>
            <small className="routine-tool__hint">See your pitch as you play.</small>

            {(step.kind === 'record' || step.kind === 'focus') && (
              <>
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className="routine-tool__toggle"
                  role="switch"
                  aria-checked={desk.autoSoundRecording}
                  onClick={() => patchDesk({ autoSoundRecording: !desk.autoSoundRecording })}
                >
                  <strong>Hands-free recording</strong>
                  <i />
                </Pressable>
                <small className="routine-tool__hint">Waits for a quiet moment, then records sustained sound.</small>
              </>
            )}
          </div>
          <p className="practice-menu-note">{summarizeDesk(desk, tunerTransposition)}</p>
        </section>
      )}

      {kindNeedsDesk(step.kind) && <RoutineProgramSetup value={step.programId} onChange={programId => onChange({ programId })} />}


      </>}

      {!toolsOnly && <Pressable
        type="button"
        intensity="soft"
        haptic="warning"
        hapticFeedback={hapticFeedback}
        className="routine-link routine-link--danger"
        onClick={onRemove}
      >
        <Trash2 aria-hidden />
        Remove this step
      </Pressable>}
      {footerTarget ? createPortal(footer, footerTarget) : footer}
    </div>
  )
}
