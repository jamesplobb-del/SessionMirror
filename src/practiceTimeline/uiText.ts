/** Shorten visible labels while keeping full text in title/aria where needed. */
export function abbreviateLabel(value: string, maxChars: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxChars) return trimmed
  if (maxChars <= 1) return '…'
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`
}
