import { SCALE_RUSH_ASSETS } from '../../labs/scaleRush/scaleRushAssets'

interface ScaleRushCharacterProps {
  hopping: boolean
  landing: boolean
  hit: boolean
}

export default function ScaleRushCharacter({ hopping, landing, hit }: ScaleRushCharacterProps) {
  const idle = !hopping && !landing && !hit

  return (
    <div
      className={[
        'sr-char',
        idle && 'sr-char--idle',
        hopping && 'sr-char--hop',
        landing && 'sr-char--land',
        hit && 'sr-char--hit',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <div className="sr-char__shadow" />
      <img
        className="sr-char__sprite"
        src={SCALE_RUSH_ASSETS.trumpetPlayer}
        alt=""
        draggable={false}
      />
    </div>
  )
}
