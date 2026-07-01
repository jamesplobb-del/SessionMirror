import { useEffect, useReducer, useRef } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { createPitchSnapshot, evaluatePitchAgainstTarget } from '../engine/pitchInput'
import { createInitialScaleRushState, scaleRushReducer } from './reducer'
import type { ScaleRushConfig } from './types'

const WRONG_NOTE_COOLDOWN_MS = 450

export function useScaleRushGame(readout: PitchReadout, enabled: boolean) {
  const [state, dispatch] = useReducer(scaleRushReducer, undefined, createInitialScaleRushState)
  const lastHandledTargetRef = useRef<number | null>(null)
  const lastWrongAtRef = useRef(0)

  const startWithConfig = (config: ScaleRushConfig) => {
    dispatch({ type: 'START_WITH_CONFIG', config })
  }

  const restart = () => dispatch({ type: 'RESTART' })
  const backToSetup = () => dispatch({ type: 'BACK_TO_SETUP' })

  useEffect(() => {
    if (!enabled || state.phase !== 'playing' || state.targetMidi == null) {
      lastHandledTargetRef.current = null
      return
    }

    const snapshot = createPitchSnapshot(readout)
    const result = evaluatePitchAgainstTarget(snapshot, state.targetMidi)

    if (result.kind === 'match') {
      if (lastHandledTargetRef.current === state.targetMidi) return
      lastHandledTargetRef.current = state.targetMidi
      dispatch({ type: 'CORRECT_NOTE' })
      return
    }

    if (result.kind === 'wrong') {
      const now = Date.now()
      if (now - lastWrongAtRef.current < WRONG_NOTE_COOLDOWN_MS) return
      lastWrongAtRef.current = now
      dispatch({ type: 'WRONG_NOTE' })
    }
  }, [enabled, readout, state.phase, state.targetMidi])

  useEffect(() => {
    if (state.phase !== 'playing') {
      lastHandledTargetRef.current = null
      lastWrongAtRef.current = 0
    }
  }, [state.phase, state.targetMidi])

  return {
    state,
    startWithConfig,
    restart,
    backToSetup,
  }
}
