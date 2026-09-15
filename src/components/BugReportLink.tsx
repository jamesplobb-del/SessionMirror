import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Bug, ChevronRight } from 'lucide-react'
import { buildBugReportEmail } from '../utils/bugReport'

export default function BugReportLink({ email, instrument }: { email: string; instrument: string }) {
  const [version, setVersion] = useState(`Web ${__APP_VERSION__}`)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    setVersion(`Web bundle ${__APP_VERSION__} (native version unavailable)`)
    void App.getInfo().then(info => {
      if (active) setVersion(`${info.version} (build ${info.build}; web ${__APP_VERSION__})`)
    }).catch(() => { /* The draft remains usable if native metadata is unavailable. */ })
    return () => { active = false }
  }, [])

  return (
    <a className="set-row" href={buildBugReportEmail(email, version, instrument)} style={{ textDecoration: 'none' }}>
      <span className="set-row__icon" style={{ ['--set-icon-bg' as string]: '#ff9500' }} aria-hidden><Bug /></span>
      <span className="set-row__label">Report a bug</span>
      <ChevronRight className="set-row__chevron" aria-hidden />
    </a>
  )
}
