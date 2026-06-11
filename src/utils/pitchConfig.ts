/** Pitch detection bounds — instruments + singing voice (A440). */

/** Low bass voice / double bass ≈ 65 Hz. */
export const MIN_INSTRUMENT_HZ = 65

/** Upper singing voice / violin upper range. */
export const MAX_INSTRUMENT_HZ = 1100

export type TunerInstrument = 'voice' | 'strings' | 'winds'

export interface PitchTunerProfile {
  label: string
  description: string
  minHz: number
  maxHz: number
  clarityMin: number
  clarityMinMic: number
  frameSize: number
  frameSizeMic: number
  rmsGateDbMedia: number
  rmsGateDbMic: number
  attackFrames: number
  outlierCents: number
  holdMs: number
  holdMsMic: number
  smoothAlpha: number
  needleSmoothAlpha: number
  noteChangeSmoothAlpha: number
  graphSmoothWindow: number
  noteHysteresisCents: number
  /** UI readout refresh interval (ms). Lower = snappier note/cents display. */
  readoutIntervalMs: number
  /** Frequency smoothing for note/HZ readout (higher = faster lock). */
  readoutFreqAlpha: number
  /** Blend latest sample into rendered trace tip (0–1). Keeps dot on the line. */
  traceEndBlend: number
  /** Max cents the trace may move per frame on the same note. */
  traceSpikeCapCents: number
  /** Max cents the trace may move per frame when the note changes. */
  traceNoteJumpCapCents: number
  /** Cents readout quantization step (smaller = finer display). */
  readoutCentsStep: number
  /** Keep profile smoothing in widget/realtime mode (voice/strings). */
  widgetSmoothTrace?: boolean
  /** Snap readout to 0¢ inside this band (voice comfort zone). */
  readoutDeadbandCents?: number
}

const VOICE_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Voice',
  description: 'Sensitive live mic with a smooth trace and forgiving intonation readout.',
  minHz: 65,
  maxHz: 1100,
  clarityMin: 0.7,
  clarityMinMic: 0.78,
  frameSize: 4096,
  frameSizeMic: 4096,
  rmsGateDbMedia: -54,
  rmsGateDbMic: -48,
  attackFrames: 1,
  outlierCents: 30,
  holdMs: 260,
  holdMsMic: 300,
  smoothAlpha: 0.28,
  needleSmoothAlpha: 0.36,
  noteChangeSmoothAlpha: 0.55,
  graphSmoothWindow: 6,
  noteHysteresisCents: 28,
  readoutIntervalMs: 0,
  readoutFreqAlpha: 0.68,
  traceEndBlend: 0.5,
  traceSpikeCapCents: 3.5,
  traceNoteJumpCapCents: 10,
  readoutCentsStep: 1,
  widgetSmoothTrace: true,
  readoutDeadbandCents: 2,
}

const STRINGS_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Strings',
  description: 'Exact intonation readout; trace eases between notes to stay readable.',
  minHz: 82,
  maxHz: 1400,
  clarityMin: 0.76,
  clarityMinMic: 0.84,
  frameSize: 8192,
  frameSizeMic: 8192,
  rmsGateDbMedia: -52,
  rmsGateDbMic: -44,
  attackFrames: 1,
  outlierCents: 18,
  holdMs: 340,
  holdMsMic: 420,
  smoothAlpha: 0.3,
  needleSmoothAlpha: 0.92,
  noteChangeSmoothAlpha: 0.92,
  graphSmoothWindow: 5,
  noteHysteresisCents: 26,
  readoutIntervalMs: 0,
  readoutFreqAlpha: 0.96,
  traceEndBlend: 0.72,
  traceSpikeCapCents: 5,
  traceNoteJumpCapCents: 10,
  readoutCentsStep: 0.5,
  widgetSmoothTrace: true,
}

const WINDS_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Winds',
  description:
    'Responsive tuning for flute, clarinet, saxophone, oboe, trumpet, horn, and other wind instruments.',
  minHz: 55,
  maxHz: 1760,
  clarityMin: 0.68,
  clarityMinMic: 0.72,
  frameSize: 4096,
  frameSizeMic: 2048,
  rmsGateDbMedia: -50,
  rmsGateDbMic: -42,
  attackFrames: 1,
  outlierCents: 34,
  holdMs: 200,
  holdMsMic: 130,
  smoothAlpha: 0.58,
  needleSmoothAlpha: 0.98,
  noteChangeSmoothAlpha: 0.98,
  graphSmoothWindow: 3,
  noteHysteresisCents: 10,
  readoutIntervalMs: 0,
  readoutFreqAlpha: 0.99,
  traceEndBlend: 0.82,
  traceSpikeCapCents: 7,
  traceNoteJumpCapCents: 14,
  readoutCentsStep: 0.5,
}

export const TUNER_INSTRUMENTS: TunerInstrument[] = ['voice', 'strings', 'winds']

export function getTunerProfile(instrument: TunerInstrument): PitchTunerProfile {
  switch (instrument) {
    case 'strings':
      return STRINGS_TUNER_PROFILE
    case 'winds':
      return WINDS_TUNER_PROFILE
    default:
      return VOICE_TUNER_PROFILE
  }
}

/** McLeod pitch method clarity gate (0–1). */
export const PITCH_CLARITY_MIN = 0.74

/** Stricter clarity for live microphone (rejects room noise). */
export const PITCH_CLARITY_MIN_MIC = 0.86

/** Analysis frame — playback (lower latency). */
export const PITCH_FRAME_SIZE = 4096

/** Live mic — larger window for stability. */
export const PITCH_FRAME_SIZE_MIC = 8192

/** Minimum RMS in dB before attempting pitch. */
export const PITCH_MIN_VOLUME_DB = -58

/** RMS gate for playback analysis — ignore very quiet passages. */
export const PITCH_RMS_GATE_DB_MEDIA = -54

/** RMS gate for live mic — must be clearly above room noise. */
export const PITCH_RMS_GATE_DB_MIC = -46

/** Consecutive good frames required before showing pitch from silence. */
export const PITCH_ATTACK_FRAMES = 2

/** Reject same-note cents jumps larger than this (noise spikes). */
export const PITCH_OUTLIER_CENTS = 20

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 320

/** Longer hold for live mic when signal drops. */
export const PITCH_HOLD_MS_MIC = 480

/** Smoothing factor for live frequency (0–1, higher = snappier). */
export const PITCH_SMOOTH_ALPHA = 0.32

/** Needle / numeric readout smoothing while holding the same note. */
export const PITCH_NEEDLE_SMOOTH_ALPHA = 0.38

/** Snap toward new note cents quickly on note changes. */
export const PITCH_NOTE_CHANGE_SMOOTH_ALPHA = 0.62

/** Moving-average radius when drawing the trace curve (lower = sharper per-note). */
export const PITCH_GRAPH_SMOOTH_WINDOW = 2

/** Round displayed cents to this step. */
export const CENTS_DISPLAY_STEP = 1

/** UI cents readout refresh interval (ms). */
export const PITCH_READOUT_INTERVAL_MS = 36

/** Trace sample pushed each frame while live mic hears no pitch (chart floor). */
export const PITCH_SILENCE_FLOOR_CENTS = -50

/** Note label sticks until cents drift toward the next semitone boundary. */
export const NOTE_HYSTERESIS_CENTS = 24

export const INSTRUMENT_RANGE_LABEL = 'Voice · winds · strings'

export type PitchCanvasTheme = 'glass-widget' | 'glass-legacy' | 'solid'
