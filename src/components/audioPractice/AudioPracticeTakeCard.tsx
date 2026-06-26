import { Pause, Play, Pin, Star, Trash2, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Take } from '../../types'
import { formatAudioDuration } from '../../utils/formatAudioTakeTime'
import { triggerLightHaptic } from '../../utils/haptics'
import { resolveMediaPlaybackSrc } from '../../utils/mediaPlayback'
import { takeHasPlaybackMedia } from '../../utils/takes'
import MiniTakeWaveform from './MiniTakeWaveform'

interface AudioPracticeTakeCardProps {
  variant: 'best' | 'current'
  take: Take
  isPlaying: boolean
  playbackProgress: number
  compareActive?: boolean
  subtitle?: string
  canMakeBest?: boolean
  compact?: boolean
  onPlayToggle: () => void
  onMakeBest?: () => void
  onDiscard?: () => void
}

function useTakeDurationSeconds(take: Take, isPlaying: boolean): number | null {
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setDuration(null)

    const src = resolveMediaPlaybackSrc(take.videoUrl)
    if (!src) return

    const audio = document.createElement('audio')
    prepare(audio, src)

    function prepare(element: HTMLAudioElement, url: string) {
      element.preload = 'metadata'
      element.src = url
      element.addEventListener(
        'loadedmetadata',
        () => {
          if (cancelled) return
          if (Number.isFinite(element.duration) && element.duration > 0) {
            setDuration(Math.round(element.duration))
          }
        },
        { once: true },
      )
      element.load()
    }

    return () => {
      cancelled = true
      audio.src = ''
    }
  }, [take.id, take.videoUrl])

  useEffect(() => {
    if (!isPlaying) return
    const src = resolveMediaPlaybackSrc(take.videoUrl)
    if (!src) return
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = src
    const onTime = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration))
      }
    }
    audio.addEventListener('loadedmetadata', onTime)
    audio.addEventListener('durationchange', onTime)
    audio.load()
    return () => {
      audio.removeEventListener('loadedmetadata', onTime)
      audio.removeEventListener('durationchange', onTime)
      audio.src = ''
    }
  }, [isPlaying, take.id, take.videoUrl])

  return duration
}

export default function AudioPracticeTakeCard({
  variant,
  take,
  isPlaying,
  playbackProgress,
  compareActive = false,
  subtitle,
  canMakeBest = false,
  compact = false,
  onPlayToggle,
  onMakeBest,
  onDiscard,
}: AudioPracticeTakeCardProps) {
  const durationSeconds = useTakeDurationSeconds(take, isPlaying)
  const durationLabel = durationSeconds != null ? formatAudioDuration(durationSeconds) : '—'
  const playbackUrl = resolveMediaPlaybackSrc(take.videoUrl)
  const hasMedia = takeHasPlaybackMedia(take)
  const accent = variant === 'best' ? 'gold' : 'red'

  return (
    <article
      className={`audio-practice-take-card audio-practice-take-card--${variant} ${compact ? 'audio-practice-take-card--compact' : ''}`}
      aria-label={variant === 'best' ? 'Best take' : 'Current take'}
    >
      <header className="audio-practice-take-card__header">
        <div className="audio-practice-take-card__title-row">
          {variant === 'best' ? (
            <Trophy className="audio-practice-take-card__icon audio-practice-take-card__icon--gold" aria-hidden />
          ) : (
            <span className="audio-practice-take-card__live-dot" aria-hidden />
          )}
          <span className="audio-practice-take-card__eyebrow">
            {variant === 'best' ? 'Best Take' : 'Current Take'}
          </span>
        </div>
        <div className="audio-practice-take-card__meta">
          <h3 className="audio-practice-take-card__name">{subtitle ?? take.name}</h3>
          <span className="audio-practice-take-card__duration">{durationLabel}</span>
        </div>
      </header>

      <div className="audio-practice-take-card__waveform-wrap">
        {hasMedia && playbackUrl ? (
          <MiniTakeWaveform
            takeId={take.id}
            playbackUrl={playbackUrl}
            progress={isPlaying ? playbackProgress : 0}
            accent={accent}
          />
        ) : (
          <div className="audio-practice-take-card__waveform-empty" aria-hidden />
        )}
      </div>

      <div className="audio-practice-take-card__actions">
        <button
          type="button"
          className="audio-practice-take-card__play"
          disabled={!hasMedia}
          aria-label={isPlaying ? 'Pause take' : 'Play take'}
          onClick={() => {
            triggerLightHaptic()
            onPlayToggle()
          }}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <div className="audio-practice-take-card__chips">
          {variant === 'best' && (
            <>
              <span className="audio-practice-take-card__chip audio-practice-take-card__chip--muted">
                <Pin className="h-3.5 w-3.5" aria-hidden />
                Pinned
              </span>
              {compareActive && (
                <span className="audio-practice-take-card__chip audio-practice-take-card__chip--compare">
                  Compare Active
                </span>
              )}
            </>
          )}

          {variant === 'current' && (
            <>
              {canMakeBest && onMakeBest && (
                <button
                  type="button"
                  className="audio-practice-take-card__chip audio-practice-take-card__chip--action"
                  onClick={() => {
                    triggerLightHaptic()
                    onMakeBest()
                  }}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden />
                  Make Best
                </button>
              )}
              {onDiscard && (
                <button
                  type="button"
                  className="audio-practice-take-card__chip audio-practice-take-card__chip--danger"
                  onClick={() => {
                    triggerLightHaptic()
                    onDiscard()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Discard
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
