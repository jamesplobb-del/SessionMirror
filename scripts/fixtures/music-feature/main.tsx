// Isolated production-component verification. Fixture documents are loaded only
// with ?check=1; the actual app never seeds the music library.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../../src/db'
import MusicLibrary from '../../../src/components/MusicLibrary'
import PracticeChartLayer from '../../../src/components/PracticeChartLayer'
import ReferenceWidget from '../../../src/components/ReferenceWidget'
import AudioPracticeTopTabs from '../../../src/components/audioPractice/AudioPracticeTopTabs'
import type { AudioPracticeTab } from '../../../src/types/audioPractice'
import { blankDesk } from '../../../src/utils/practiceRoutines'
import { loadMusicSetup, saveMusicSetup } from '../../../src/utils/musicLibrary'
import { savePracticeChart } from '../../../src/utils/practiceChartStorage'
import { pickHudQuickSettings } from '../../../src/utils/hudQuickSettings'
import type { AppSettings } from '../../../src/utils/appSettings'
import '../../../src/index.css'
import '../../../src/styles/open-lens.css'
import '../../../src/styles/open-lens-system.css'

function Fixture() {
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [library, setLibrary] = useState(true)
  const [tab, setTab] = useState<AudioPracticeTab>('music')
  const [desk, setDesk] = useState(blankDesk('audio'))
  const [full, setFull] = useState(false)
  const [revision, setRevision] = useState(0)
  const [references, setReferences] = useState(false)
  const [removedCanvases, setRemovedCanvases] = useState(0)
  const boundary = useRef<HTMLDivElement>(null)
  const youtubeIframe = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('check')) return
    let cancelled = false
    void (async () => {
      const bytes = await fetch('../app-design/music-layout-check.pdf').then(response => response.arrayBuffer())
      const rows = ['Layout check A', 'Layout check B', 'Layout check C'].map((name, index) => ({ id: `music-feature-check-${index}`, name, createdAt: index }))
      for (const row of rows) await savePracticeChart(row.id, new File([bytes], `${row.name}.pdf`, { type: 'application/pdf' }))
      saveMusicSetup(rows[0].id, { ...blankDesk('audio'), showMetronome: true, metronome: { ...blankDesk('audio').metronome, bpm: 100 } })
      if (!cancelled) setProjects(rows)
    })()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const observer = new MutationObserver(changes => {
      let removed = 0
      for (const change of changes) for (const node of change.removedNodes) if (node instanceof Element) {
        removed += (node.matches('.practice-chart-page canvas') ? 1 : 0) + node.querySelectorAll('.practice-chart-page canvas').length
      }
      if (removed) setRemovedCanvases(value => value + removed)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return <div ref={boundary} className={active && !library ? 'app-shell--music-page' : undefined} style={{ position: 'relative', height: '100dvh', background: 'white', display: 'flex', flexDirection: 'column' }} data-removed-canvases={removedCanvases}>
    {!full && <div style={{ zIndex: 12, paddingTop: 12 }}><AudioPracticeTopTabs activeTab={tab} onTabChange={setTab} /></div>}
    <div style={{ flex: 1, minHeight: 0, display: tab === 'music' && library ? 'flex' : 'none', zIndex: 10 }}>
      <MusicLibrary projects={projects} activeProjectId={active} revision={revision} disabled={false}
        onCreateItem={async name => { const id = crypto.randomUUID(); setProjects(rows => [...rows, { id, name, createdAt: Date.now() }]); return id }}
        onImported={() => setRevision(value => value + 1)} onOpen={async id => { setActive(id); setDesk(loadMusicSetup(id) ?? blankDesk('audio')); setLibrary(false) }} />
    </div>
    {active && <PracticeChartLayer key={active} projectId={active} active={tab === 'music' && !library} boundaryRef={boundary} offerFileOnOpen={false}
      workspace={pickHudQuickSettings(desk as AppSettings)} onWorkspaceChange={(key, enabled) => setDesk(value => ({ ...value, [key]: enabled }))}
      referencesVisible={references} onReferencesChange={setReferences} onClose={() => setLibrary(true)} onPaperVisibleChange={() => {}} onChromeHiddenChange={setFull}
      isRecording={false} isStopping={false} recordReady={false} recordElapsed={0} onToggleRecord={() => {}} handsFreeEnabled={false} handsFreePhase={null} onToggleHandsFree={() => {}} />}
    {active && !library && references && <ReferenceWidget boundaryRef={boundary} expanded onExpandedChange={setReferences} visible youtubeUrl={null} libraryPlayback={null}
      suspended onExpandView={() => {}} onSubmitYoutube={() => {}} onUpload={() => {}} onClearAudio={() => {}} onClearYoutube={() => {}}
      onYoutubeHostChange={() => {}} youtubeIframeRef={youtubeIframe} onPlaybackChange={() => {}} onBeforePlay={() => {}} />}
  </div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
