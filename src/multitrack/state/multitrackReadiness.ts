import type { MultitrackSession } from '../types'
import { missingImportedAssetNames } from './multitrackAssetRecovery'

/** Missing intended sources must not silently become a smaller performance. */
export function missingMultitrackFiles(session: MultitrackSession, options: {
  targetPanelId?: string | null
  monitorMutes?: ReadonlySet<string>
} = {}): string[] {
  const recording = options.targetPanelId != null
  const names = session.panels.flatMap((panel, index) => {
    if (panel.kind !== 'performance' || panel.hidden || panel.take || !panel.missingTakeId ||
      panel.id === options.targetPanelId ||
      (recording && (panel.muted || options.monitorMutes?.has(panel.id)))) return []
    return [panel.label || `Box ${index + 1}`]
  })
  const imported = recording && options.monitorMutes?.has('backing')
    ? missingImportedAssetNames({ ...session, backing: { kind: 'none', volume: session.backing.volume } })
    : missingImportedAssetNames(session)
  return [...new Set([...names, ...imported])]
}

export function missingMultitrackMessage(names: string[]): string {
  return `These files need reconnecting: ${names.join(', ')}. Choose a recording from Take Vault or hide its part in Projects → Parts. Reconnect backing audio and sheet music in Tools, or remove them if you no longer need them.`
}
