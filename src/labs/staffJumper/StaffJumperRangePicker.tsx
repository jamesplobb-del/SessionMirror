import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from '../balance/BalanceArcadeShell'
import StaffGlyph, { useMusicGlyphMetrics } from './StaffGlyph'
import { resolveFullWrittenRange } from './staffJumperInstruments'
import {
  exerciseMidiBounds,
  getKeySignatureMarkers,
  MIN_RANGE_SCALE_NOTES,
  midiPoolForConfig,
  prettyWrittenMidi,
  scaleDisplayName,
  scaleNoteCountInWindow,
  spellWrittenMidi,
  type StaffJumperConfig,
} from './staffJumperMusicLogic'
import { keySignatureStepPx, layoutMusicGlyph } from './staffGlyphMetrics'
import {
  CLEF_ANCHOR_YPX,
  CLEF_TO_SIGNATURE_GAP,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_H,
  NOTEHEAD_W,
  NOTE_SPACING_PX,
  SIGNATURE_TO_NOTE_GAP,
  STAFF_BOTTOM_Y,
  STAFF_CLEF_X,
  STAFF_FIRST_NOTE_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  STEM_LENGTH,
  STEM_THICKNESS,
  getStaffPositionForNote,
  stemDirectionForY,
  stemTipY,
  stemXForNote,
} from './staffNotationMap'

/** Wider than the in-game staff so degree labels and ledgers can breathe. */
const PICKER_STEP_X = NOTE_SPACING_PX * 0.92
const PICKER_HIT_W = NOTE_SPACING_PX * 0.8
const PICKER_VISIBLE_NOTES = 6

function labelOffsetY(yPx: number): number {
  return stemDirectionForY(yPx) === 'down'
    ? -(NOTEHEAD_H / 2 + STAFF_SPACE_PX * 1.05)
    : NOTEHEAD_H / 2 + STAFF_SPACE_PX * 0.95
}

interface StaffJumperRangePickerProps {
  config: StaffJumperConfig
  hapticFeedback: boolean
  onBack: () => void
  onConfirm: (lowMidi: number, highMidi: number) => void
}

function snapToPool(midi: number, pool: readonly number[]): number {
  if (pool.length === 0) return midi
  return pool.reduce((best, candidate) =>
    Math.abs(candidate - midi) < Math.abs(best - midi) ? candidate : best,
  )
}

function degreeLabel(letter: string, accidental: '#' | 'b' | null): string {
  return `${letter}${accidental === 'b' ? '♭' : accidental === '#' ? '♯' : ''}`
}

/**
 * Tap the lowest scale note, then the highest.
 *
 * The instrument's compass is written as a real scale in the chosen key —
 * same heads, stems and ledgers as the game — so a beginner can take C to G
 * and a stronger player can take that C up to the A above the staff.
 */
export default function StaffJumperRangePicker({
  config,
  hapticFeedback,
  onBack,
  onConfirm,
}: StaffJumperRangePickerProps) {
  const glyphMetrics = useMusicGlyphMetrics()
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 320, height: 420 })
  const instrument = resolveFullWrittenRange(
    config.instrumentId,
    config.transposition,
    config.clef,
    config.tunerInstrument,
  )
  const initial = exerciseMidiBounds(config)
  const [low, setLow] = useState(initial.minMidi)
  const [high, setHigh] = useState(initial.maxMidi)
  const [awaitingSecond, setAwaitingSecond] = useState(false)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const spellingKey = config.customPitchClasses?.length ? ('C' as const) : config.key
  const usingCustom = Boolean(config.customPitchClasses?.length)
  const minNotes = usingCustom ? 2 : MIN_RANGE_SCALE_NOTES

  const scaleMidis = useMemo(
    () =>
      midiPoolForConfig({
        ...config,
        rangeLowMidi: instrument.minMidi,
        rangeHighMidi: instrument.maxMidi,
      }),
    [config, instrument.maxMidi, instrument.minMidi],
  )

  const snappedLow = snapToPool(low, scaleMidis)
  const snappedHigh = snapToPool(high, scaleMidis)
  const noteCount = scaleNoteCountInWindow(config, snappedLow, snappedHigh)
  const canConfirm = !awaitingSecond && noteCount >= minNotes

  const keySignature = useMemo(
    () => (usingCustom ? [] : getKeySignatureMarkers(config.key, config.scaleMode, config.clef)),
    [config.clef, config.key, config.scaleMode, usingCustom],
  )

  const head = useMemo(() => {
    const clefName =
      config.clef === 'alto'
        ? ('altoClef' as const)
        : config.clef === 'treble'
          ? ('trebleClef' as const)
          : ('bassClef' as const)
    const clefWidth = layoutMusicGlyph(clefName, STAFF_SPACE_PX, glyphMetrics).width
    let width = STAFF_CLEF_X + clefWidth
    const signatureX = width + CLEF_TO_SIGNATURE_GAP
    if (keySignature.length > 0) {
      const symbol = keySignature[0]!.symbol
      const glyph = layoutMusicGlyph(symbol === '#' ? 'sharp' : 'flat', STAFF_SPACE_PX, glyphMetrics)
      width =
        signatureX +
        (keySignature.length - 1) * keySignatureStepPx(symbol, STAFF_SPACE_PX) +
        glyph.width
    }
    const clefEnd = width
    return {
      clefName,
      signatureX,
      clefEnd,
      notesStart: Math.max(
        STAFF_FIRST_NOTE_X,
        clefEnd + SIGNATURE_TO_NOTE_GAP + LEDGER_LINE_W,
      ),
    }
  }, [config.clef, glyphMetrics, keySignature])

  const scaleNotes = useMemo(() => {
    const stepX = PICKER_STEP_X
    return scaleMidis.map((midi, index) => {
      const written = spellWrittenMidi(midi, spellingKey)
      const staff = getStaffPositionForNote(written.letter, written.octave, config.clef)
      return {
        midi,
        written,
        staff,
        xPx: head.notesStart + NOTEHEAD_W / 2 + index * stepX,
        label: prettyWrittenMidi(midi, spellingKey),
        degree: degreeLabel(written.letter, written.accidental),
      }
    })
  }, [config.clef, head.notesStart, scaleMidis, spellingKey])

  const view = useMemo(() => {
    const ys = scaleNotes.flatMap((note) => [
      note.staff.yPx,
      ...note.staff.ledgerLineYPx,
      note.staff.yPx - STEM_LENGTH,
      note.staff.yPx + STEM_LENGTH,
      note.staff.yPx + labelOffsetY(note.staff.yPx),
    ])
    const top = Math.min(STAFF_TOP_Y, ...ys) - STAFF_SPACE_PX * 0.7
    const bottom = Math.max(STAFF_BOTTOM_Y, ...ys) + STAFF_SPACE_PX * 0.9
    const last = scaleNotes.at(-1)
    const worldWidth = (last ? last.xPx + NOTEHEAD_W : head.notesStart) + STAFF_SPACE_PX
    const worldHeight = bottom - top
    const visibleSpan = head.notesStart + PICKER_STEP_X * PICKER_VISIBLE_NOTES + NOTEHEAD_W
    const focusHeight = STAFF_BOTTOM_Y - STAFF_TOP_Y + STAFF_SPACE_PX * 7
    const scale = Math.min(
      1,
      box.width / Math.max(visibleSpan, 1),
      box.height / Math.max(focusHeight, 1),
    )
    return {
      top,
      worldHeight,
      worldWidth,
      scale,
      pinWidth: (head.clefEnd + STAFF_SPACE_PX * 0.35) * scale,
      lineWidth: Math.max(worldWidth, box.width / Math.max(scale, 0.01)),
    }
  }, [box.height, box.width, head.clefEnd, head.notesStart, scaleNotes])

  useLayoutEffect(() => {
    const board = hostRef.current
    const start = scaleNotes.find((note) => note.midi === snappedLow)
    const end = scaleNotes.find((note) => note.midi === snappedHigh)
    if (!board || !start) return
    const toScreenY = (yPx: number) => (yPx - view.top) * view.scale
    const midY = (toScreenY(start.staff.yPx) + toScreenY((end ?? start).staff.yPx)) / 2
    board.scrollTop = Math.max(0, midY - board.clientHeight * 0.48)
    board.scrollLeft = Math.max(
      0,
      start.xPx * view.scale - view.pinWidth - NOTEHEAD_W * view.scale * 0.4,
    )
  }, [scaleNotes, snappedHigh, snappedLow, view.pinWidth, view.scale, view.top])

  const tapNote = (midi: number) => {
    if (!awaitingSecond) {
      setLow(midi)
      setHigh(midi)
      setAwaitingSecond(true)
      return
    }
    setLow(Math.min(low, midi))
    setHigh(Math.max(high, midi))
    setAwaitingSecond(false)
  }

  const keyName = usingCustom ? 'your notes' : scaleDisplayName(config.key, config.scaleMode)
  const lowLabel = prettyWrittenMidi(snappedLow, spellingKey)
  const highLabel = prettyWrittenMidi(snappedHigh, spellingKey)
  const hint = awaitingSecond
    ? `Lowest note ${lowLabel}. Tap the top of the range.`
    : canConfirm
      ? `${lowLabel} to ${highLabel} · ${noteCount} notes in ${keyName}`
      : 'Tap the lowest note, then the highest. Need a little more of the scale.'

  const selected = scaleNotes.filter((note) => note.midi >= snappedLow && note.midi <= snappedHigh)
  const washLeft = (selected[0]?.xPx ?? 0) - NOTEHEAD_W * 0.85
  const washRight = (selected.at(-1)?.xPx ?? 0) + NOTEHEAD_W * 0.85
  const washTop =
    Math.min(STAFF_TOP_Y, ...(selected.length ? selected.map((note) => note.staff.yPx) : [STAFF_TOP_Y])) -
    STAFF_SPACE_PX * 1.6
  const washBottom =
    Math.max(STAFF_BOTTOM_Y, ...(selected.length ? selected.map((note) => note.staff.yPx) : [STAFF_BOTTOM_Y])) +
    STAFF_SPACE_PX * 1.6

  return (
    <BalanceArcadeShell
      title="Range"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Back to Staff Jumper"
      className="balance-arcade--picker"
      scrollBody={false}
      footer={
        <div className="balance-ready__dock">
          <p className="sj-range-picker__hint">{hint}</p>
          <Pressable
            type="button"
            haptic="medium"
            hapticFeedback={hapticFeedback}
            disabled={!canConfirm}
            onClick={() => onConfirm(Math.min(snappedLow, snappedHigh), Math.max(snappedLow, snappedHigh))}
            className="balance-cta"
          >
            Use this range
          </Pressable>
        </div>
      }
    >
      <div>
        <h1 className="balance-display balance-display--page">Choose a range</h1>
        <p className="balance-subdisplay">
          {keyName} · {instrument.label}
        </p>
      </div>

      <div className="sj-range-picker__board" ref={hostRef}>
        <div
          className="sj-range-picker__frame"
          style={{
            width: `${view.lineWidth * view.scale}px`,
            height: `${view.worldHeight * view.scale}px`,
          }}
        >
          <div
            className="sj-range-picker__world"
            style={{
              transform: `translateY(${-view.top * view.scale}px) scale(${view.scale})`,
              transformOrigin: '0 0',
              width: `${view.lineWidth}px`,
            }}
          >
            {selected.length > 0 ? (
              <div
                className="sj-range-picker__wash"
                style={{
                  left: `${washLeft}px`,
                  width: `${Math.max(NOTEHEAD_W, washRight - washLeft)}px`,
                  top: `${washTop}px`,
                  height: `${Math.max(STAFF_SPACE_PX, washBottom - washTop)}px`,
                }}
              />
            ) : null}

            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{
                    top: `${yPx}px`,
                    width: `${view.lineWidth}px`,
                    height: `${STAFF_LINE_THICKNESS}px`,
                  }}
                />
              ))}
            </div>

            <svg
              className="sj-rhythm-layer"
              width={view.lineWidth}
              height={view.worldHeight}
              viewBox={`0 ${view.top} ${view.lineWidth} ${view.worldHeight}`}
              style={{ top: `${view.top}px`, height: `${view.worldHeight}px` }}
              focusable="false"
            >
              {scaleNotes.map((note) => {
                const inRange = note.midi >= snappedLow && note.midi <= snappedHigh
                const direction = stemDirectionForY(note.staff.yPx)
                const x = stemXForNote(note.xPx, direction)
                const yEnd = stemTipY(note.staff.yPx, direction)
                return (
                  <rect
                    key={`stem-${note.midi}`}
                    className={`sj-stem ${inRange ? '' : 'sj-range-stem--out'}`}
                    x={x - STEM_THICKNESS / 2}
                    y={Math.min(note.staff.yPx, yEnd)}
                    width={STEM_THICKNESS}
                    height={Math.abs(yEnd - note.staff.yPx)}
                  />
                )
              })}
            </svg>

            {scaleNotes.map((note) => {
              const inRange = note.midi >= snappedLow && note.midi <= snappedHigh
              const endpoint = note.midi === snappedLow || note.midi === snappedHigh
              const state = endpoint ? 'end' : inRange ? 'in' : 'out'
              return (
                <div
                  key={note.midi}
                  className={`sj-note sj-range-note sj-range-note--${state}`}
                  style={{ left: `${note.xPx}px`, top: `${note.staff.yPx}px` }}
                >
                  {note.staff.ledgerLineYPx.map((ledgerY) => (
                    <span
                      key={ledgerY}
                      className="sj-note__ledger"
                      style={{
                        top: `${ledgerY - note.staff.yPx}px`,
                        width: `${LEDGER_LINE_W}px`,
                        height: `${LEDGER_LINE_THICKNESS}px`,
                      }}
                    />
                  ))}
                  {usingCustom ? (
                    <span className="sj-custom-accidental">
                      {note.written.accidental === 'b' ? '♭' : note.written.accidental === '#' ? '♯' : '♮'}
                    </span>
                  ) : null}
                  <span
                    className="sj-note__head"
                    style={{ width: `${NOTEHEAD_W}px`, height: `${NOTEHEAD_H}px` }}
                  />
                  <span
                    className="sj-range-note__label"
                    style={{
                      top: `${labelOffsetY(note.staff.yPx)}px`,
                      fontSize: `${STAFF_SPACE_PX * 0.58}px`,
                    }}
                  >
                    {endpoint ? note.label : note.degree}
                  </span>
                  <button
                    type="button"
                    className="sj-range-note__hit"
                    style={{
                      width: `${PICKER_HIT_W}px`,
                      height: `${STEM_LENGTH + STAFF_SPACE_PX * 2.8}px`,
                    }}
                    aria-label={note.label}
                    aria-pressed={endpoint}
                    onClick={() => tapNote(note.midi)}
                  />
                </div>
              )
            })}
          </div>

          <div
            className="sj-range-picker__clef-pin"
            style={{
              width: `${view.pinWidth}px`,
              height: `${view.worldHeight * view.scale}px`,
            }}
          >
            <div
              className="sj-range-picker__clef-pin-world"
              style={{
                transform: `translateY(${-view.top * view.scale}px) scale(${view.scale})`,
                transformOrigin: '0 0',
                width: `${head.clefEnd}px`,
              }}
            >
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={`pin-${yPx}`}
                  className="sj-staff-line"
                  style={{
                    top: `${yPx}px`,
                    width: `${head.clefEnd}px`,
                    height: `${STAFF_LINE_THICKNESS}px`,
                  }}
                />
              ))}
              <StaffGlyph
                name={head.clefName}
                spacePx={STAFF_SPACE_PX}
                staffY={CLEF_ANCHOR_YPX[config.clef]}
                x={STAFF_CLEF_X}
                metrics={glyphMetrics}
                className="sj-clef"
              />
              {keySignature.map((marker, index) => (
                <StaffGlyph
                  key={`pin-${marker.symbol}-${marker.yPx}-${index}`}
                  name={marker.symbol === '#' ? 'sharp' : 'flat'}
                  spacePx={STAFF_SPACE_PX}
                  staffY={marker.yPx}
                  x={head.signatureX + index * keySignatureStepPx(marker.symbol, STAFF_SPACE_PX)}
                  metrics={glyphMetrics}
                  className="sj-key-signature__symbol"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BalanceArcadeShell>
  )
}
