import type { MultitrackSession, SheetMusicAsset, SheetMusicPanelState } from '../types'

/** Missing files stay in their timeline slots, but must never enter a media player. */
export function missingImportedAssetNames(session: MultitrackSession): string[] {
  const names: string[] = []
  if (session.backing.kind === 'audio' && session.backing.missing) names.push(session.backing.fileName || 'Backing audio')
  for (const asset of [session.sheetMusic.asset, ...(session.sheetMusic.cues ?? []).map(cue => cue.asset)]) {
    if (asset?.missing) names.push(asset.fileName || 'Music, photo or PDF')
  }
  return [...new Set(names)]
}

/** Reconnecting a source preserves the saved view, including the selected PDF page. */
export function reconnectSheetAsset(previous: SheetMusicAsset, replacement: SheetMusicAsset): SheetMusicAsset {
  if ((previous.mimeType === 'application/pdf') !== (replacement.mimeType === 'application/pdf')) {
    throw new Error(previous.mimeType === 'application/pdf' ? 'Choose a PDF to reconnect this part.' : 'Choose an image to reconnect this part.')
  }
  if (replacement.mimeType === 'application/pdf' && replacement.pageCount !== undefined &&
      (previous.pageIndex ?? 0) >= replacement.pageCount) {
    throw new Error(`This PDF does not include the saved page ${(previous.pageIndex ?? 0) + 1}. Choose the original PDF or remove this part.`)
  }
  return { ...previous, src: replacement.src, fileName: replacement.fileName, mimeType: replacement.mimeType,
    pageCount: replacement.pageCount, missing: undefined }
}

/** Page turns can reuse one PDF source: reconnect every missing view of that file. */
export function reconnectSheetSource(panel: SheetMusicPanelState, source: string, replacement: SheetMusicAsset): SheetMusicPanelState {
  const reconnect = (asset: SheetMusicAsset) => asset.missing && asset.src === source ? reconnectSheetAsset(asset, replacement) : asset
  return { ...panel, asset: panel.asset ? reconnect(panel.asset) : null,
    cues: panel.cues?.map(cue => ({ ...cue, asset: reconnect(cue.asset) })) }
}
