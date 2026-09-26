import { createRoot } from 'react-dom/client'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import PracticeTimelineView from '../../../src/practiceTimeline/components/PracticeTimelineView'
import { createDefaultSection, createEmptyTimeline } from '../../../src/practiceTimeline/sectionDefaults'
import { saveTimeline } from '../../../src/practiceTimeline/storage/timelineStorage'
import '../../../src/index.css'
import '../../../src/styles/audio-mode-tools.css'
import '../../../src/styles/open-lens-system.css'

document.documentElement.id = 'lens-design-system'
document.documentElement.classList.add('lens-system', 'app-audio-mode')
const previewKey = 'besttake:focused-program-preview-id'
if (!sessionStorage.getItem(previewKey)) {
  const program = createEmptyTimeline('My Practice')
  program.sections = [
    createDefaultSection({ title: 'Warm-up', bars: 8, bpm: 72 }),
    createDefaultSection({ title: 'Scale study', bars: 16, bpm: 92, repeatCount: 2 }),
    createDefaultSection({ title: 'Etude', bars: 12, bpm: 108 }),
  ]
  sessionStorage.setItem(previewKey, saveTimeline(program).id)
}

createRoot(document.getElementById('root')!).render(
  <ActionSheetProvider><MetronomeProvider>
    <main className="app-ui-overlay app-ui-overlay--audio-mode app-ui-overlay--audio-practice-timeline app-ui-overlay--audio-practice-metronome" style={{ height: '100dvh', maxWidth: 470, margin: 'auto', background: 'var(--audio-bg-base)' }}>
      <PracticeTimelineView />
    </main>
  </MetronomeProvider></ActionSheetProvider>,
)
