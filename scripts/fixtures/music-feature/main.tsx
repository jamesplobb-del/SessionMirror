// Isolated production-component verification. Fixture documents are loaded only
// with ?check=1; the actual app never seeds the music library.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import type { Project } from '../../../src/db'
import MusicLibrary from '../../../src/components/MusicLibrary'
import PracticeChartLayer from '../../../src/components/PracticeChartLayer'
import ReferenceWidget from '../../../src/components/ReferenceWidget'
import MusicWidgetDrawer from '../../../src/components/MusicWidgetDrawer'
import { useCollapsibleWidget } from '../../../src/components/useCollapsibleWidget'
import HandsFreeStage from '../../../src/components/HandsFreeStage'
import RoutineBar from '../../../src/components/RoutineBar'
import AudioPracticeTopTabs from '../../../src/components/audioPractice/AudioPracticeTopTabs'
import type { AudioPracticeTab } from '../../../src/types/audioPractice'
import { blankDesk, createRoutine, createStep } from '../../../src/utils/practiceRoutines'
import { loadMusicSetup, saveMusicSetup } from '../../../src/utils/musicLibrary'
import { savePracticeChart } from '../../../src/utils/practiceChartStorage'
import { saveWebPracticeChart } from '../../../src/utils/webPracticeChartStorage'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import { pickHudQuickSettings } from '../../../src/utils/hudQuickSettings'
import type { AppSettings } from '../../../src/utils/appSettings'
import '../../../src/index.css'
import '../../../src/styles/practice-routines.css'
import '../../../src/styles/open-lens.css'
import '../../../src/styles/open-lens-system.css'
import '../../../src/styles/premium-app.css'

const fixtureStep = createStep({ title: 'Warmup', minutes: 5 })
const fixtureRoutine = createRoutine('Fixture routine', [fixtureStep], null)

function FixtureDockTool({ boundaryRef, id, label, slot }: { boundaryRef: RefObject<HTMLDivElement | null>; id: string; label: string; slot: number }) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(120), y = useMotionValue(180)
  const fold = useCollapsibleWidget({ boundaryRef, widgetRef, x, y, positionId: id,
    label, icon: <span>{label[0]}</span>, detail: label, ballSlot: slot, dockRight: true })
  return <>{fold.ball}<motion.div ref={widgetRef} style={{ x, y, width: 210, position: 'absolute', zIndex: 36,
    padding: 16, border: '1px solid #dbe5ef', borderRadius: 16, background: 'white' }}
    data-music-reading-tool className={fold.collapsed ? 'widget-is-collapsed' : ''}>
    {label} panel <button onClick={fold.collapse}>Collapse</button>
  </motion.div></>
}

function Fixture() {
  const [projects, setProjects] = useState<Project[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [library, setLibrary] = useState(true)
  const [tab, setTab] = useState<AudioPracticeTab>('music')
  const [desk, setDesk] = useState(blankDesk('audio'))
  const [full, setFull] = useState(false)
  const [revision, setRevision] = useState(0)
  const [references, setReferences] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [silenceSeconds, setSilenceSeconds] = useState(2)
  const [volumeThreshold, setVolumeThreshold] = useState(35)
  const [removedCanvases, setRemovedCanvases] = useState(0)
  const boundary = useRef<HTMLDivElement>(null)
  const youtubeIframe = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('check')) return
    let cancelled = false
    void (async () => {
      const bytes = await fetch('../app-design/music-layout-check.pdf').then(response => response.arrayBuffer())
      const rows = ['Layout check A', 'Layout check B', 'Layout check C'].map((name, index) => ({ id: `music-feature-check-${index}`, name, createdAt: index }))
      const readerOnly = new URLSearchParams(location.search).has('reader')
      for (const row of rows) {
        if (readerOnly) {
          // Component-only reader fixture: seed a document, never an entitlement.
          await saveWebPracticeChart(row.id, { blob: new Blob([bytes], { type: 'application/pdf' }), mimeType: 'application/pdf', fileName: `${row.name}.pdf` })
          localStorage.setItem(`besttake:practice-chart:v1:${row.id}`, JSON.stringify({ filePath: `charts/${row.id}.pdf`, mimeType: 'application/pdf', fileName: `${row.name}.pdf` }))
        } else await savePracticeChart(row.id, new File([bytes], `${row.name}.pdf`, { type: 'application/pdf' }))
      }
      saveMusicSetup(rows[0].id, { ...blankDesk('audio'), showMetronome: true, metronome: { ...blankDesk('audio').metronome, bpm: 100 } })
      if (!cancelled) {
        setProjects(rows)
        if (readerOnly) { setActive(rows[0].id); setLibrary(false) }
      }
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
  return <div ref={boundary} className={active && !library ? `app-shell--music-page${full ? ' app-shell--music-chrome-hidden' : ''}${drawerOpen ? '' : ' app-shell--music-dock-closed'}` : undefined} style={{ position: 'relative', height: '100dvh', background: 'white', display: 'flex', flexDirection: 'column' }} data-removed-canvases={removedCanvases}>
    {!full && <div style={{ zIndex: 12, paddingTop: 12 }}><AudioPracticeTopTabs activeTab={tab} onTabChange={setTab} /></div>}
    <div style={{ flex: 1, minHeight: 0, display: tab === 'music' && library ? 'flex' : 'none', zIndex: 10 }}>
      <MusicLibrary projects={projects} activeProjectId={active} instrumentId={null} revision={revision} disabled={false}
        onCreateItem={async name => { const id = crypto.randomUUID(); setProjects(rows => [...rows, { id, name, createdAt: Date.now() }]); return id }}
        onImported={() => setRevision(value => value + 1)} onOpen={async id => { setActive(id); setDesk(loadMusicSetup(id) ?? blankDesk('audio')); setLibrary(false) }} />
    </div>
    {active && <PracticeChartLayer key={active} projectId={active} active={tab === 'music' && !library} boundaryRef={boundary} offerFileOnOpen={false}
      workspace={pickHudQuickSettings(desk as AppSettings)} onWorkspaceChange={(key, enabled) => setDesk(value => ({ ...value, [key]: enabled }))}
      referencesVisible={references} onReferencesChange={setReferences} onClose={() => setLibrary(true)} onPaperVisibleChange={() => {}} onChromeHiddenChange={setFull}
      isRecording={false} isStopping={false} recordReady={false} recordElapsed={0} onToggleRecord={() => {}} handsFreeEnabled={false} handsFreePhase={null} onToggleHandsFree={() => {}}
      toolRailOpen={drawerOpen} onToolRailOpenChange={setDrawerOpen} />}
    {active && !library && <MusicWidgetDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />}
    {active && !library && <FixtureDockTool boundaryRef={boundary} id="desk-metronome" label="Metronome" slot={0} />}
    {active && !library && <FixtureDockTool boundaryRef={boundary} id="desk-drone" label="Drone" slot={1} />}
    {active && !library && <HandsFreeStage phase="listening" movable dockRight elapsed={0}
      silenceSeconds={silenceSeconds} volumeThreshold={volumeThreshold}
      onSilenceSecondsChange={setSilenceSeconds} onVolumeThresholdChange={setVolumeThreshold} />}
    {active && !library && <RoutineBar routine={fixtureRoutine} day={null} step={fixtureStep} nextStep={null}
      startedAt={null} paused audioSurface tunerTransposition="concert" hapticFeedback={false}
      onResume={() => {}} onPause={() => {}} onClose={() => {}} onDone={() => {}}
      onJumpToStep={() => {}} onOpenToday={() => {}} preferBall />}
    {active && !library && <ReferenceWidget boundaryRef={boundary} expanded={references} onExpandedChange={setReferences} visible dockRight youtubeUrl={null} libraryPlayback={null}
      suspended onExpandView={() => {}} onSubmitYoutube={() => {}} onUpload={() => {}} onClearAudio={() => {}} onClearYoutube={() => {}}
      onYoutubeHostChange={() => {}} youtubeIframeRef={youtubeIframe} onPlaybackChange={() => {}} onBeforePlay={() => {}} />}
  </div>
}
createRoot(document.getElementById('root')!).render(<ActionSheetProvider><Fixture /></ActionSheetProvider>)
