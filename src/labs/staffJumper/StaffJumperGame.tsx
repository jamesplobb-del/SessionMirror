import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { getPracticeGameCharacter } from '../practiceGameCharacters'
import {
  computeAccuracy,
  DIFFICULTY_LABELS,
  getDetectedPitchClass,
  getKeySignatureMarkers,
  getTargetNoteAtStep,
  getVisiblePlatforms,
  isRhythmMode,
  pitchClassLabel,
  pitchClassesMatch,
  showKeySignature,
  type StaffJumperState,
} from './staffJumperMusicLogic'
import {
  BARLINE_THICKNESS,
  BEAM_THICKNESS,
  CLEF_ANCHOR_YPX,
  CLEF_TO_SIGNATURE_GAP,
  DOT_GAP,
  DOT_RADIUS,
  dotYForNote,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  NOTEHEAD_H,
  PLAYER_ANCHOR_X_PX,
  SIGNATURE_TO_NOTE_GAP,
  STAFF_BOTTOM_Y,
  STAFF_CANVAS_HEIGHT,
  STAFF_CLEF_X,
  STAFF_FIRST_NOTE_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_MIDDLE_Y,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  STEM_THICKNESS,
  TIME_SIGNATURE_FONT_SIZE,
  TIME_SIGNATURE_WIDTH,
  TIME_SIGNATURE_YPX,
  NOTE_SPACING_PX,
  type StemDirection,
} from './staffNotationMap'
import StaffGlyph, { useMusicGlyphMetrics } from './StaffGlyph'
import StaffRest from './StaffRest'
import { keySignatureStepPx, layoutMusicGlyph } from './staffGlyphMetrics'
import { layoutRhythm } from './staffJumperNotationLayout'
import { isHollowNotehead, METERS } from './staffJumperRhythm'
import { describeWrittenRhythm, formatBeats } from './staffJumperRhythmReading'
import {
  clamp01,
  FREE_PLAY_LIGHT_PROGRESS,
  groundLaneScreenY,
  nextLightProgress,
  PLANK_HEIGHT_PX,
  PLAYER_HEIGHT_SPACES,
  readingCue,
  travelX,
  walkwayPlank,
  type ReadingCue,
} from './staffJumperTravel'
import Pressable from '../../components/ui/Pressable'

interface StaffJumperGameProps {
  state: StaffJumperState
  readout: PitchReadout
  onPause: () => void
  hapticFeedback: boolean
  onFallComplete: () => void
  turnRemainingMs: number
  turnDurationMs: number
  /** Rhythm mode: the pulse of the bar the click is on, 0-based. */
  beatInBar: number | null
  /** 0 at the current notehead, 1 at the next. Driven by the game clock. */
  getTravelProgress: () => number
}

/**
 * Notes kept in the DOM ahead of the player. Eighth notes are narrow, so a
 * screen's worth of them needs more slots than a screen of quarters.
 */
const VISIBLE_NOTE_COUNT = 10

/**
 * How much of the staff to keep readable ahead of the player, measured in
 * quarter-note widths. The staff shrinks to honour this when the pinned clef
 * and key signature are wide (six flats eat real estate on a phone).
 *
 * Sight reading falls apart if you can only see the note you are playing, so
 * this buys roughly a bar of lookahead — and because spacing now follows
 * duration, a bar of eighths fits in well under a bar's worth of width.
 */
const MIN_LOOKAHEAD_NOTES = 3.9

/** Fraction of the playfield height the five-line staff should occupy. */
const STAFF_HEIGHT_FRACTION = 0.28

/** Screen-space margin that keeps the complete score opening inside the viewport. */
const SCORE_OPENING_MARGIN_PX = 14

interface ReadingHintInput {
  cue: ReadingCue
  easy: boolean
  rhythmMode: boolean
  holding: boolean
  currentIsRest: boolean
  currentLabel: string
  nextLabel: string
  holdBeats: string
  /** Rhythm mode only: how the written value is counted aloud. */
  count: string | null
  detectedPc: number | null
  isMatch: boolean
  isPlayableMatch: boolean
  cents: number
}

/**
 * What to tell the player, in the order they need to hear it.
 *
 * Steps rather than one nested conditional, because the play cue moves ahead
 * of the note being held: "what to play next" and "what to hold now" are two
 * different answers, and which one is wanted depends only on where in the
 * note the run is.
 */
function readingHint(input: ReadingHintInput): string {
  // Silence is counted, not played — until the pickup for the next note.
  if (input.currentIsRest && !input.cue.leading) {
    return input.rhythmMode ? `Rest — count ${input.holdBeats}` : 'Rest — count it through'
  }
  // The glow has moved on: name the note it moved to, never the one underfoot.
  if (input.cue.leading) {
    return input.easy ? `Play ${input.nextLabel}` : 'Play the lit note'
  }
  if (input.holding) return `Hold it — ${input.holdBeats}`
  if (input.detectedPc == null) {
    const what = input.easy ? `Play ${input.currentLabel}` : 'Play the lit note'
    return input.count ? `${what} ${input.count}` : what
  }
  if (input.isPlayableMatch) return Math.abs(input.cents) <= 8 ? 'Centered' : 'Hold steady'
  if (input.isMatch) return `${input.cents > 0 ? '+' : ''}${input.cents}¢ from center`
  return 'Try again'
}

function glyphNameForAccidental(accidental: '#' | 'b') {
  return accidental === '#' ? ('sharp' as const) : ('flat' as const)
}

/**
 * The hooked flag on an unbeamed eighth note.
 *
 * Drawn rather than set from a font: the SMuFL flag glyphs are absent from the
 * system music fonts this game falls back to, and a flag has to start exactly
 * at the stem tip to look attached.
 */
function flagPath(x: number, y: number, direction: StemDirection): string {
  const sign = direction === 'up' ? 1 : -1
  const width = STAFF_SPACE_PX * 1.15
  const drop = STAFF_SPACE_PX * 2.1 * sign
  const belly = STAFF_SPACE_PX * 0.75 * sign
  return [
    `M ${x} ${y}`,
    `C ${x + width * 0.95} ${y + belly * 0.55} ${x + width} ${y + drop * 0.5} ${x + width * 0.42} ${y + drop}`,
    `C ${x + width * 1.05} ${y + drop * 0.52} ${x + width * 0.55} ${y + belly * 0.7} ${x} ${y + belly * 1.5}`,
    'Z',
  ].join(' ')
}

/**
 * The bar's beats as a row of dots, the current one lit.
 *
 * Rhythm mode's replacement for the countdown bar: the question is no longer
 * "how long until this note times out" but "where in the bar are we", which
 * is what a musician looks at a conductor for.
 */
function BeatStrip({ beat, count }: { beat: number | null; count: number }) {
  return (
    <div className="sj-beat-strip" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={[
            'sj-beat-strip__dot',
            index === 0 ? 'sj-beat-strip__dot--downbeat' : '',
            beat === index ? 'sj-beat-strip__dot--on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  )
}

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="sj-hud-hearts" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`sj-hud-heart ${i < count ? 'sj-hud-heart--full' : 'sj-hud-heart--empty'}`}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </div>
  )
}

export default function StaffJumperGame({
  state,
  readout,
  onPause,
  hapticFeedback,
  onFallComplete,
  turnRemainingMs,
  turnDurationMs,
  beatInBar,
  getTravelProgress,
}: StaffJumperGameProps) {
  const config = state.config!
  const rhythmMode = isRhythmMode(config)
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedPc = getDetectedPitchClass(readout, config)
  const isMatch = detectedPc != null && pitchClassesMatch(detectedPc, target.pitchClass)
  const detectedNote =
    detectedPc != null ? (isMatch ? target.noteLabel : pitchClassLabel(detectedPc, config.key)) : '—'
  const isPlayableMatch = isMatch && (config.difficulty !== 'hard' || Math.abs(readout.cents) <= 20)
  const accuracy = computeAccuracy(state.correctCount, state.missCount)
  const cents = Math.round(readout.cents)
  const targetDisplay = target.isRest
    ? 'Rest'
    : config.difficulty === 'easy'
      ? target.noteLabel
      : 'See staff'
  const meterSpec = METERS[config.meter]
  const nextNote = getTargetNoteAtStep(config, state.sequenceStep + 1)

  /**
   * How far into this note's walk the next head takes the glow.
   *
   * With the click running the travel is the written length, so the cue can be
   * placed in beats. Free play's travel is the dwell after an accepted note,
   * which is short and has nothing to do with the written value — half of it
   * is all the warning there is to give.
   */
  const lightProgress = rhythmMode
    ? nextLightProgress(target.rhythm.durationUnits, meterSpec.pulseUnits)
    : FREE_PLAY_LIGHT_PROGRESS

  /**
   * Only the reading cue is state.
   *
   * The walk itself — the scroll, the character, the trail behind it — is
   * written straight to the DOM a frame at a time in `applyFrame`, because
   * re-rendering a screenful of engraved notation sixty times a second to move
   * one transform is how a phone drops frames. The cue changes twice a note.
   */
  const [cue, setCue] = useState<ReadingCue>({ litStep: 0, leading: false, walking: false })
  const cueRef = useRef(cue)

  /** Rhythm mode: the written value under the player, in words. */
  const writtenRhythm = rhythmMode ? describeWrittenRhythm(target.rhythm, meterSpec) : null
  const holdBeats = formatBeats(target.rhythm.durationUnits, meterSpec)
  /** Past the attack: the answer is now the note's length, not its name. */
  const holding = cue.walking || state.isSustaining
  const playDisplay = cue.leading
    ? config.difficulty === 'easy'
      ? nextNote.noteLabel
      : 'See staff'
    : targetDisplay

  const responseHint = readingHint({
    cue,
    easy: config.difficulty === 'easy',
    rhythmMode,
    holding,
    currentIsRest: target.isRest,
    currentLabel: target.noteLabel,
    nextLabel: nextNote.noteLabel,
    holdBeats,
    count: writtenRhythm?.count ?? null,
    detectedPc,
    isMatch,
    isPlayableMatch,
    cents,
  })

  const playfieldRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  /**
   * Top of the target dock, in playfield coordinates.
   *
   * The walkway hangs above it, and the dock's height moves with its contents
   * — a beat strip in rhythm mode, a countdown in free play, a hint that wraps
   * to two lines on a narrow phone — so it is measured rather than guessed.
   */
  const [dockTopPx, setDockTopPx] = useState<number | null>(null)

  /**
   * layout.scale: world-px → screen-px multiplier.
   * Size from the five-line staff itself, then place its midpoint just above
   * the vertical center. This keeps C4–B6 readable without making the staff
   * drift when its world-space safety margins change.
   *
   * layout.baseY: screen Y of world Y=0 after aligning the staff midpoint.
   */
  const [viewport, setViewport] = useState({ width: 390, height: 700 })

  useLayoutEffect(() => {
    const measure = () => {
      const el = playfieldRef.current
      if (!el) return
      setViewport({ width: el.clientWidth, height: el.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useLayoutEffect(() => {
    const dock = dockRef.current
    const field = playfieldRef.current
    if (!dock || !field) {
      setDockTopPx(null)
      return
    }
    const measure = () => {
      setDockTopPx(dock.getBoundingClientRect().top - field.getBoundingClientRect().top)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    observer.observe(field)
    return () => observer.disconnect()
  }, [state.isFalling])

  const platforms = useMemo(
    () => getVisiblePlatforms(config, state.sequenceStep, VISIBLE_NOTE_COUNT),
    [config, state.sequenceStep],
  )

  const keySignature = useMemo(
    () => (showKeySignature() ? getKeySignatureMarkers(config.key, config.scaleMode, config.clef) : []),
    [config.clef, config.difficulty, config.key, config.scaleMode],
  )

  const glyphMetrics = useMusicGlyphMetrics()

  /**
   * Opening notation is part of the scrolling score. It appears once at the
   * beginning, then leaves the playfield instead of crowding every measure.
   */
  const staffHead = useMemo(() => {
    const clefName = config.clef === 'treble' ? ('trebleClef' as const) : ('bassClef' as const)
    const clefWidth = layoutMusicGlyph(clefName, STAFF_SPACE_PX, glyphMetrics).width
    let width = STAFF_CLEF_X + clefWidth

    const signatureX = width + CLEF_TO_SIGNATURE_GAP
    let signatureWidth = 0
    if (keySignature.length > 0) {
      const symbol = keySignature[0]!.symbol
      const glyph = layoutMusicGlyph(glyphNameForAccidental(symbol), STAFF_SPACE_PX, glyphMetrics)
      signatureWidth =
        (keySignature.length - 1) * keySignatureStepPx(symbol, STAFF_SPACE_PX) + glyph.width
      width = signatureX + signatureWidth
    }

    const timeSignatureX = width + CLEF_TO_SIGNATURE_GAP
    width = timeSignatureX + TIME_SIGNATURE_WIDTH

    return {
      clefName,
      clefWidth,
      signatureX,
      signatureWidth,
      timeSignatureX,
      width: width + SIGNATURE_TO_NOTE_GAP,
    }
  }, [config.clef, glyphMetrics, keySignature])

  // Wide key signatures can extend beyond the original first-note origin.
  // Shift the displayed score just enough to preserve a clean gap without
  // changing the underlying rhythm or pitch sequence.
  const notationLeadInOffset = Math.max(0, staffHead.width - STAFF_FIRST_NOTE_X)
  const displayedPlatforms = useMemo(
    () =>
      platforms.map((slot) => ({
        ...slot,
        xPx: slot.xPx + notationLeadInOffset,
      })),
    [notationLeadInOffset, platforms],
  )
  const rhythmLayout = useMemo(() => layoutRhythm(displayedPlatforms), [displayedPlatforms])

  /**
   * Scale so the staff reads well vertically while retaining useful lookahead.
   * The score opening scrolls away, so it no longer taxes every screenful.
   */
  const staffHeight = STAFF_BOTTOM_Y - STAFF_TOP_Y
  const heightScale = (viewport.height * STAFF_HEIGHT_FRACTION) / staffHeight
  const widthScale =
    (viewport.width - PLAYER_ANCHOR_X_PX) /
    (NOTE_SPACING_PX * MIN_LOOKAHEAD_NOTES + NOTEHEAD_W)
  const scale = Math.max(0.5, Math.min(1.15, Math.min(heightScale, widthScale)))
  const baseY = viewport.height * 0.47 - STAFF_MIDDLE_Y * scale
  const playerModel = getPracticeGameCharacter(config.playerModel)

  /**
   * Player position — feet on the walkway, a lane under the whole staff.
   *
   * The character no longer rides the noteheads: pitch is what the page is
   * for, and a sprite standing on a head covers the head, its stem and
   * whatever is written above it. Its X is the reading line, so the column it
   * stands in is still the note being read.
   *
   * Its box scales with the staff so the same clearance holds at every zoom;
   * the per-character optical scale rides on top of that as a transform, and
   * has to be counted when asking how tall the thing on screen actually is.
   */
  const playerBoxPx = STAFF_SPACE_PX * PLAYER_HEIGHT_SPACES * scale
  const groundScreenY = groundLaneScreenY({
    baseY,
    scale,
    playerHeightPx: playerBoxPx * playerModel.scale,
    dockTopPx: dockTopPx ?? viewport.height * 0.78,
  })
  const groundWorldY = (groundScreenY - baseY) / Math.max(scale, 0.1)
  /** The world canvas has to reach the walkway or the SVG clips the planks. */
  const worldCanvasHeight = Math.max(STAFF_CANVAS_HEIGHT, groundWorldY + PLANK_HEIGHT_PX + 4)
  const targetPlatform = displayedPlatforms.find((p) => p.step === state.sequenceStep)
  const nextPlatform = displayedPlatforms.find((p) => p.step === state.sequenceStep + 1)
  const fromWorldX = targetPlatform?.xPx ?? target.xPx + notationLeadInOffset
  const toWorldX = nextPlatform?.xPx ?? nextNote.xPx + notationLeadInOffset

  /**
   * The first note has to leave world X=0 on screen or the clef and key
   * signature are clipped, so the opening pins the score at its left margin
   * and lets the character walk in from it. Easing the anchor back to the
   * reading point across that first walk is what stops the score jumping a
   * screen's width sideways the moment the first note is done.
   */
  const openingAnchorX = Math.max(
    PLAYER_ANCHOR_X_PX,
    fromWorldX * scale + SCORE_OPENING_MARGIN_PX,
  )

  const visibleWorldWidth = viewport.width / Math.max(scale, 0.1)
  const lastVisibleX =
    displayedPlatforms.length > 0 ? displayedPlatforms[displayedPlatforms.length - 1]!.xPx : toWorldX
  const staffWorldWidth = Math.max(
    1200,
    toWorldX + visibleWorldWidth + NOTE_SPACING_PX * 3,
    lastVisibleX + NOTE_SPACING_PX * 3,
  )

  /** The ground the character covers on this note; the trail fills it as it walks. */
  const currentPlank = walkwayPlank(state.sequenceStep, fromWorldX, toWorldX)

  const worldRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<SVGRectElement>(null)
  const lastAnchorRef = useRef<number | null>(null)
  /** Everything a frame needs, handed to the loop without re-subscribing it. */
  const frame = {
    scale,
    baseY,
    fromWorldX,
    toWorldX,
    openingAnchorX,
    opening: state.sequenceStep === 0,
    step: state.sequenceStep,
    currentIsRest: target.isRest,
    nextIsRest: nextNote.isRest,
    lightProgress,
    plankWidth: currentPlank?.width ?? 0,
  }
  const frameRef = useRef(frame)
  frameRef.current = frame

  /**
   * One frame of the walk.
   *
   * The score scrolls so the character stays on the reading line, which is why
   * a long note scrolls through its own length instead of parking a head on
   * screen with empty staff to the right of it.
   */
  const applyFrame = useCallback(() => {
    const view = frameRef.current
    const progress = clamp01(getTravelProgress())
    const worldX = travelX(view.fromWorldX, view.toWorldX, progress)
    const anchorX = view.opening
      ? view.openingAnchorX + (PLAYER_ANCHOR_X_PX - view.openingAnchorX) * progress
      : PLAYER_ANCHOR_X_PX
    const scrollX = anchorX - worldX * view.scale
    const transform = `translate3d(${scrollX}px, ${view.baseY}px, 0) scale(${view.scale})`
    if (worldRef.current) worldRef.current.style.transform = transform
    if (headRef.current) headRef.current.style.transform = transform
    if (playerRef.current && lastAnchorRef.current !== anchorX) {
      lastAnchorRef.current = anchorX
      playerRef.current.style.left = `${anchorX}px`
    }
    if (trailRef.current) {
      trailRef.current.setAttribute('width', `${Math.max(0, view.plankWidth * progress)}`)
    }

    // Re-render only when the cue itself turns over — twice a note, not sixty
    // times a second. Compared against a ref rather than left to React's
    // bail-out so the frame loop cannot schedule work it does not need.
    const next = readingCue(
      view.step,
      view.currentIsRest,
      view.nextIsRest,
      progress,
      view.lightProgress,
    )
    const shown = cueRef.current
    if (
      shown.litStep !== next.litStep ||
      shown.leading !== next.leading ||
      shown.walking !== next.walking
    ) {
      cueRef.current = next
      setCue(next)
    }
  }, [getTravelProgress])

  // Before paint, so a re-render never shows the previous frame's scroll.
  useLayoutEffect(applyFrame)

  useEffect(() => {
    let raf = requestAnimationFrame(function step() {
      applyFrame()
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [applyFrame])

  const feedbackAnnouncement =
    state.feedback === 'perfect'
      ? 'Perfect pitch.'
      : state.feedback === 'good'
        ? 'Landed.'
        : state.feedback === 'timeout'
          ? `Time is up. ${state.hearts} hearts left.`
          : state.feedback === 'missed-beat'
            ? `Missed the beat. ${state.hearts} hearts left.`
            : state.feedback === 'wrong'
              ? `Wrong note. ${state.hearts} hearts left.`
              : ''
  const targetAnnouncement = target.isRest
    ? rhythmMode
      ? `Rest for ${holdBeats}.`
      : 'Rest. Wait for the next note.'
    : config.difficulty === 'easy'
      ? rhythmMode
        ? `Target ${target.noteLabel}, ${writtenRhythm!.name.toLowerCase()}, ${writtenRhythm!.count}.`
        : `Target ${target.noteLabel}.`
      : rhythmMode
        ? `Read the next note, ${writtenRhythm!.name.toLowerCase()}, ${writtenRhythm!.count}.`
        : `Read the next note for jump ${state.sequenceStep + 1}.`
  const turnFraction = Math.max(0, Math.min(1, turnRemainingMs / Math.max(1, turnDurationMs)))

  const timingLabel =
    state.timing === 'on'
      ? 'On the beat'
      : state.timing === 'early'
        ? `Early ${Math.abs(state.timingErrorMs)}ms`
        : state.timing === 'late'
          ? `Late ${Math.abs(state.timingErrorMs)}ms`
          : null

  /**
   * Rhythm mode's running verdict on the last note: where the attack sat,
   * what its spacing read as if that was not the written value, and whether
   * a long note was held through. Stays up until the next note is judged.
   */
  const rhythmVerdict = rhythmMode
    ? [
        timingLabel,
        state.playedRhythmLabel ? `sounded like ${state.playedRhythmLabel}` : null,
        state.holdQuality === 'full' ? 'held' : state.holdQuality === 'short' ? 'cut short' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const prevAdvanceRef = useRef(state.advanceToken)
  const prevMissRef = useRef(state.missToken)
  const jumpActive = state.advanceToken > prevAdvanceRef.current
  const missActive = state.missToken > prevMissRef.current

  useEffect(() => { prevAdvanceRef.current = state.advanceToken }, [state.advanceToken])
  useEffect(() => { prevMissRef.current = state.missToken }, [state.missToken])

  useEffect(() => {
    if (!state.isFalling) return
    const t = window.setTimeout(onFallComplete, 1100)
    return () => window.clearTimeout(t)
  }, [state.isFalling, onFallComplete])

  return (
    <div className="sj-screen sj-screen--playing">
      <div className="sj-playfield" ref={playfieldRef}>
        {/* ── Staff ── */}
        <div className="sj-staff-viewport">
          {/*
            The five lines never scroll: they are horizontally uniform, so
            pinning them keeps the staff continuous under the clef instead of
            starting at the world's left edge.
          */}
          <div
            className="sj-staff-backdrop"
            style={{
              transform: `translateY(${baseY}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: `${visibleWorldWidth}px`,
              height: `${STAFF_CANVAS_HEIGHT}px`,
            }}
          >
            <div
              className="sj-staff-band"
              style={{
                top: `${STAFF_TOP_Y}px`,
                height: `${staffHeight}px`,
                width: `${visibleWorldWidth}px`,
              }}
            />
            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{
                    top: `${yPx}px`,
                    width: `${visibleWorldWidth}px`,
                    height: `${STAFF_LINE_THICKNESS}px`,
                  }}
                />
              ))}
            </div>
          </div>

          {/*
            The transform is set by `applyFrame`, never here: it changes every
            frame while everything else on this layer changes twice a note.

            Transform order (applied right-to-left in screen space):
            1. scale around origin (0,0)
            2. translateY by baseY
            3. translateX by scrollX

            Result: screen_x = world_x * scale + scrollX
                    screen_y = world_y * scale + baseY
          */}
          <div
            className="sj-staff-world"
            ref={worldRef}
            style={{
              transformOrigin: '0 0',
              height: `${worldCanvasHeight}px`,
              width: `${staffWorldWidth}px`,
            }}
          >
            {/*
              Barlines, stems, beams and flags share one SVG in world
              coordinates. Beamed stems all have to meet the same sloping line,
              so they cannot be drawn inside each note's own anchor.
            */}
            <svg
              className="sj-rhythm-layer"
              width={staffWorldWidth}
              height={worldCanvasHeight}
              viewBox={`0 0 ${staffWorldWidth} ${worldCanvasHeight}`}
              aria-hidden
              focusable="false"
            >
              {rhythmLayout.barlineXs.map((x) => (
                <rect
                  key={`bar-${x}`}
                  className="sj-barline"
                  x={x - BARLINE_THICKNESS / 2}
                  y={STAFF_TOP_Y}
                  width={BARLINE_THICKNESS}
                  height={staffHeight}
                />
              ))}

              {/*
                The walkway, in its own lane below the lowest note the game can
                write. Scenery, deliberately kept clear of the staff: a rule
                drawn near a notehead reads as a ledger line, and this one is
                not part of the music.
              */}
              {displayedPlatforms.map((slot) => {
                const following = displayedPlatforms.find((item) => item.step === slot.step + 1)
                const nextX =
                  following?.xPx ??
                  getTargetNoteAtStep(config, slot.step + 1).xPx + notationLeadInOffset
                const plank = walkwayPlank(slot.step, slot.xPx, nextX)
                if (!plank) return null
                // Ground already behind the character keeps the trail's colour,
                // so the fill reads as a path walked rather than a bar resetting.
                const walked = slot.step < state.sequenceStep
                return (
                  <rect
                    key={plank.key}
                    className={[
                      'sj-walkway',
                      slot.note.isRest ? 'sj-walkway--rest' : '',
                      walked ? 'sj-walkway--walked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    x={plank.x}
                    y={groundWorldY}
                    width={plank.width}
                    height={PLANK_HEIGHT_PX}
                    rx={PLANK_HEIGHT_PX / 2}
                    opacity={slot.opacity}
                  />
                )
              })}

              {/* Ground already covered on this note — the width is set per frame. */}
              {currentPlank && (
                <rect
                  key={`trail-${state.sequenceStep}`}
                  ref={trailRef}
                  className="sj-walkway__trail"
                  x={currentPlank.x}
                  y={groundWorldY}
                  width={0}
                  height={PLANK_HEIGHT_PX}
                  rx={PLANK_HEIGHT_PX / 2}
                />
              )}

              {rhythmLayout.stems.map((stem) => (
                <rect
                  key={stem.key}
                  className="sj-stem"
                  x={stem.x - STEM_THICKNESS / 2}
                  y={Math.min(stem.yStart, stem.yEnd)}
                  width={STEM_THICKNESS}
                  height={Math.abs(stem.yEnd - stem.yStart)}
                  opacity={stem.opacity}
                />
              ))}

              {rhythmLayout.beams.map((beam) => (
                <line
                  key={beam.key}
                  className="sj-beam"
                  x1={beam.x1}
                  y1={beam.y1}
                  x2={beam.x2}
                  y2={beam.y2}
                  strokeWidth={BEAM_THICKNESS}
                  strokeLinecap="butt"
                  opacity={beam.opacity}
                />
              ))}

              {rhythmLayout.flags.map((flag) => (
                <path
                  key={flag.key}
                  className="sj-flag"
                  d={flagPath(flag.x, flag.y, flag.direction)}
                  opacity={flag.opacity}
                />
              ))}
            </svg>

            {/* Noteheads */}
            <div className="sj-noteheads">
              {displayedPlatforms.map((slot) => {
                const isPlayLit = cue.litStep === slot.step
                const isHolding = slot.step === state.sequenceStep && cue.walking && !isPlayLit
                const inkOpacity = isPlayLit || isHolding ? 1 : slot.opacity
                const shake = missActive && !state.isFalling && slot.step === state.sequenceStep
                const crack = state.isFalling && slot.step === state.sequenceStep

                return (
                  /**
                   * .sj-note is a zero-size anchor at exactly (xPx, yPx) — the notehead center.
                   * All children are absolutely positioned relative to this point.
                   */
                  <div
                    key={slot.step}
                    className={[
                      'sj-note',
                      `sj-note--${slot.note.kind}`,
                      slot.note.isRest ? 'sj-note--rest' : '',
                      isPlayLit ? 'sj-note--target' : '',
                      isHolding ? 'sj-note--holding' : '',
                      slot.role === 'future' && !isPlayLit ? 'sj-note--future' : '',
                      slot.role === 'landed' ? 'sj-note--landed' : '',
                      shake ? 'sj-note--shake' : '',
                      crack ? 'sj-note--crack' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ left: `${slot.xPx}px`, top: `${slot.note.yPx}px` }}
                  >
                    {/* A rest replaces the whole note: no head, ledgers or label. */}
                    {slot.note.isRest && (
                      <StaffRest value={slot.note.rhythm.value} opacity={inkOpacity} />
                    )}

                    {/* Draw every ledger rule required between the staff and this note. */}
                    {slot.note.ledgerLineYPx.map((ledgerY) => (
                      <span
                        key={ledgerY}
                        className="sj-note__ledger"
                        style={{
                          top: `${ledgerY - slot.note.yPx}px`,
                          width: `${LEDGER_LINE_W}px`,
                          height: `${LEDGER_LINE_THICKNESS}px`,
                        }}
                        aria-hidden
                      />
                    ))}


                    {/* Notehead oval — centered at (0, 0) = note center.
                        Half and whole notes are rings rather than filled. */}
                    {!slot.note.isRest && (
                      <span
                        className={`sj-note__head ${
                          isHollowNotehead(slot.note.rhythm.value) ? 'sj-note__head--hollow' : ''
                        }`}
                        style={{
                          width: `${NOTEHEAD_W}px`,
                          height: `${NOTEHEAD_H}px`,
                          opacity: inkOpacity,
                          borderWidth: `${NOTEHEAD_RING_THICKNESS}px`,
                        }}
                        aria-hidden
                      />
                    )}

                    {/* Augmentation dot, always in a space. */}
                    {!slot.note.isRest && slot.note.rhythm.dotted && (
                      <span
                        className="sj-note__dot"
                        style={{
                          left: `${NOTEHEAD_W / 2 + DOT_GAP}px`,
                          top: `${dotYForNote(slot.note.yPx, slot.note.kind) - slot.note.yPx}px`,
                          width: `${DOT_RADIUS * 2}px`,
                          height: `${DOT_RADIUS * 2}px`,
                          opacity: inkOpacity,
                        }}
                        aria-hidden
                      />
                    )}

                    {/* Note name label (easy mode) */}
                    {slot.note.showLabel && (
                      <span className="sj-note__label" style={{ opacity: inkOpacity }}>
                        {slot.note.noteLabel}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* The score opening shares the world's scroll transform and appears once. */}
          <div
            className="sj-staff-head"
            ref={headRef}
            style={{
              transformOrigin: '0 0',
              width: `${staffHead.width}px`,
              height: `${STAFF_CANVAS_HEIGHT}px`,
            }}
          >
            <StaffGlyph
              name={staffHead.clefName}
              spacePx={STAFF_SPACE_PX}
              staffY={CLEF_ANCHOR_YPX[config.clef]}
              x={STAFF_CLEF_X}
              metrics={glyphMetrics}
              className="sj-clef"
            />

            {keySignature.map((marker, index) => (
              <StaffGlyph
                key={`${marker.symbol}-${marker.yPx}-${index}`}
                name={glyphNameForAccidental(marker.symbol)}
                spacePx={STAFF_SPACE_PX}
                staffY={marker.yPx}
                x={staffHead.signatureX + index * keySignatureStepPx(marker.symbol, STAFF_SPACE_PX)}
                metrics={glyphMetrics}
                className="sj-key-signature__symbol"
              />
            ))}

            {/* Time signature follows the key signature at the score opening. */}
            <svg
              className="sj-time-signature"
              style={{ left: `${staffHead.timeSignatureX}px`, top: 0 }}
              width={TIME_SIGNATURE_WIDTH}
              height={STAFF_CANVAS_HEIGHT}
              viewBox={`0 0 ${TIME_SIGNATURE_WIDTH} ${STAFF_CANVAS_HEIGHT}`}
              aria-hidden
              focusable="false"
            >
              <text
                x={TIME_SIGNATURE_WIDTH / 2}
                y={TIME_SIGNATURE_YPX[config.clef].top}
                fontSize={TIME_SIGNATURE_FONT_SIZE}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {meterSpec.numerator}
              </text>
              <text
                x={TIME_SIGNATURE_WIDTH / 2}
                y={TIME_SIGNATURE_YPX[config.clef].bottom}
                fontSize={TIME_SIGNATURE_FONT_SIZE}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {meterSpec.denominator}
              </text>
            </svg>
          </div>
        </div>

        {/* ── Player anchor walks the lane; sprite animation restarts per hop. ── */}
        <div
          ref={playerRef}
          className={`sj-player-anchor ${state.isFalling ? 'sj-player-anchor--fall' : ''}`}
          style={{ top: `${groundScreenY}px`, '--sj-player-box': `${playerBoxPx}px` } as CSSProperties}
          aria-hidden
        >
          <img
            key={`sj-player-${state.advanceToken}-${state.missToken}`}
            src={playerModel.asset}
            alt=""
            className={[
              'sj-player',
              jumpActive ? 'sj-player--hop' : '',
              missActive && !state.isFalling ? 'sj-player--stumble' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--sj-player-scale': playerModel.scale } as CSSProperties}
            draggable={false}
          />
        </div>

        {/* ── HUD ── */}
        <div className="sj-hud">
          <div className="sj-hud-top">
            <div className="sj-hud-statusbar">
              <Hearts count={state.hearts} />
              <span className="sj-hud-statusbar__rule" aria-hidden />
              <span className="sj-hud-mini-stat">
                <small>Score</small>
                <strong>{state.score}</strong>
              </span>
              <span className="sj-hud-mini-stat">
                <small>Accuracy</small>
                <strong>{accuracy}%</strong>
              </span>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              hapticFeedback={hapticFeedback}
              onClick={onPause}
              className="sj-hud-pause"
              aria-label="Pause Staff Jumper"
            >
              <Pause aria-hidden />
            </Pressable>
          </div>

          {state.streak >= 3 && (
            <div className="sj-combo-chip">
              Streak {state.streak}
            </div>
          )}

          {state.isCountingIn && (
            <div className="sj-count-in" role="status">
              <strong>Listen for the count-in</strong>
              <small>
                {config.tempoBpm} BPM · {meterSpec.label}
                {rhythmMode ? ' · play on the click' : ''}
              </small>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {feedbackAnnouncement} {targetAnnouncement}
          </p>

          {state.feedback && state.feedbackToken > 0 && (
            <div
              key={`sj-feedback-${state.feedbackToken}`}
              className={`sj-feedback-toast sj-feedback-toast--${state.feedback}`}
              aria-hidden
            >
              {state.feedback === 'perfect'
                ? 'Perfect pitch'
                : state.feedback === 'good'
                  ? 'Landed'
                  : state.feedback === 'timeout'
                    ? 'Time’s up'
                    : state.feedback === 'missed-beat'
                      ? 'Missed the beat'
                      : 'Wrong note'}
              {timingLabel && <em className={`sj-feedback-toast__timing sj-timing--${state.timing}`}>{timingLabel}</em>}
            </div>
          )}

          {!state.isFalling && (
            <div className="sj-target-dock" ref={dockRef}>
              <div className="sj-target-dock__meta">
                <span>{target.patternName}</span>
                <span>{DIFFICULTY_LABELS[config.difficulty]}</span>
              </div>
              <div className="sj-target-dock__notes">
                <div className="sj-target-note">
                  <small>{cue.leading ? 'Next' : holding ? 'Holding' : 'Target'}</small>
                  <strong>{playDisplay}</strong>
                  {writtenRhythm && !cue.leading && (
                    <span className="sj-target-note__rhythm">
                      {writtenRhythm.name} · {writtenRhythm.beats}
                    </span>
                  )}
                </div>
                <div className={`sj-detected-note ${isPlayableMatch ? 'sj-detected-note--match' : ''}`}>
                  <small>Detected</small>
                  <strong>{detectedNote}</strong>
                  {rhythmMode && (
                    <span
                      className={`sj-detected-note__rhythm ${
                        state.holdQuality === 'short' || state.playedRhythmLabel
                          ? 'sj-detected-note__rhythm--off'
                          : ''
                      }`}
                    >
                      {rhythmVerdict || 'Listening for the beat'}
                    </span>
                  )}
                </div>
              </div>
              <p className={`sj-target-dock__hint ${isPlayableMatch ? 'sj-target-dock__hint--match' : ''}`}>
                {responseHint}
              </p>
              {/* Rhythm mode is paced by the click, so show the bar instead of a countdown. */}
              {rhythmMode && <BeatStrip beat={beatInBar} count={meterSpec.pulsesPerMeasure} />}
              {/* Nothing is being timed during a rest, so nothing counts down. */}
              {!rhythmMode && !target.isRest && (
                <div
                  className="sj-turn-timer"
                  key={`sj-turn-${state.sequenceStep}-${state.missToken}`}
                  style={
                    {
                      '--sj-turn-remaining': `${turnRemainingMs}ms`,
                      '--sj-turn-fraction': turnFraction,
                    } as CSSProperties
                  }
                  aria-hidden
                >
                  <span />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
