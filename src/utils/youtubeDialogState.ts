/** True while the YouTube URL sheet is open — used to defer heavy app recovery. */
let youtubeDialogOpen = false

export function setYoutubeDialogOpen(open: boolean): void {
  youtubeDialogOpen = open
}

export function isYoutubeDialogOpen(): boolean {
  return youtubeDialogOpen
}
