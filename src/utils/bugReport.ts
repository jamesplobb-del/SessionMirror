export function buildBugReportEmail(email: string, version: string, instrument: string) {
  const body = [
    'What were you trying to do?',
    '',
    'What happened instead?',
    '',
    'Steps to make it happen again:',
    '1. ',
    '',
    'Phone/tablet model and OS version:',
    '',
    `BestTake version: ${version}`,
    `Tuner profile: ${instrument}`,
    'Instrument you were playing:',
    '',
    'You can attach a screenshot if it helps. Please avoid including private student information.',
  ].join('\n')
  return `mailto:${email}?subject=${encodeURIComponent('BestTake bug report')}&body=${encodeURIComponent(body)}`
}
