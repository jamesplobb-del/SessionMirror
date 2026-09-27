import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import '../styles/developer-note.css'

export default function DeveloperNote({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const bodyId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== dialog.current,
    )
    const inertBefore = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    continueButton.current?.focus()
    return () => {
      siblings.forEach((element, index) => { element.inert = inertBefore[index] })
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return createPortal(<div className="developer-note" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
    }}>
    <div className="developer-note__card">
      <button className="developer-note__close" type="button" aria-label="Close note" onClick={onClose}><X aria-hidden /></button>
      <span className="developer-note__eyebrow">FROM THE DEVELOPER</span>
      <h2 id={titleId}>A quick note</h2>
      <div id={bodyId} className="developer-note__body">
        <p>Hi 👋 I’m building BestTake on my own, and it’s still early. You might run into a bug or two. I’m fixing them as I go.</p>
        <p>If something acts up, head to <strong>Settings → Help → Report a bug</strong>. Those reports help me find and fix things. Thanks for giving my little app a try.</p>
      </div>
      <button ref={continueButton} className="developer-note__continue" type="button" onClick={onClose}>Let’s make some music</button>
    </div>
  </div>, document.body)
}
