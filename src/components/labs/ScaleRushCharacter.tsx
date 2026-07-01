interface ScaleRushCharacterProps {
  hopping: boolean
  landing: boolean
  hit: boolean
}

/** Cute big-headed Crossy Road style character, seen from behind. */
export default function ScaleRushCharacter({ hopping, landing, hit }: ScaleRushCharacterProps) {
  return (
    <div
      className={[
        'sr-char',
        hopping && 'sr-char--hop',
        landing && 'sr-char--land',
        hit && 'sr-char--hit',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <div className="sr-char__shadow" />
      <div className="sr-char__body">
        <div className="sr-char__head">
          <span className="sr-char__hair" />
        </div>
        <div className="sr-char__shirt" />
        <div className="sr-char__pants" />
      </div>
      <div className="sr-char__flash" />
    </div>
  )
}
