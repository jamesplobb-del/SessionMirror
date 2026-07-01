interface ScaleRushCharacterProps {
  hopping: boolean
  landing: boolean
}

export default function ScaleRushCharacter({ hopping, landing }: ScaleRushCharacterProps) {
  return (
    <div
      className={`sr-iso-char ${hopping ? 'sr-iso-char--hop' : ''} ${landing ? 'sr-iso-char--land' : ''}`}
      aria-hidden
    >
      <div className="sr-iso-char__shadow" />
      <div className="sr-iso-char__body">
        <div className="sr-iso-char__head" />
        <div className="sr-iso-char__torso" />
      </div>
    </div>
  )
}
