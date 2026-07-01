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
      <div className="sr-char__cast-shadow" />
      <div className="sr-char__sprite">
        <div className="sr-char__head">
          <span className="sr-char__eye sr-char__eye--left" />
          <span className="sr-char__eye sr-char__eye--right" />
          <span className="sr-char__head-face sr-char__head-face--south" />
          <span className="sr-char__head-face sr-char__head-face--east" />
        </div>
        <div className="sr-char__body">
          <span className="sr-char__body-face sr-char__body-face--south" />
          <span className="sr-char__body-face sr-char__body-face--east" />
        </div>
        <div className="sr-char__feet">
          <span className="sr-char__feet-face sr-char__feet-face--south" />
        </div>
      </div>
    </div>
  )
}
