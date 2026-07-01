interface ScaleRushCharacterProps {
  hopping: boolean
  landing: boolean
}

export default function ScaleRushCharacter({ hopping, landing }: ScaleRushCharacterProps) {
  return (
    <div
      className={[
        'sr-char',
        hopping && 'sr-char--hop',
        landing && 'sr-char--land',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <div className="sr-char__shadow" />
      <div className="sr-char__sprite">
        <div className="sr-char__head">
          <span className="sr-char__eye sr-char__eye--left" />
          <span className="sr-char__eye sr-char__eye--right" />
        </div>
        <div className="sr-char__body" />
        <div className="sr-char__feet" />
      </div>
    </div>
  )
}
