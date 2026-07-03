import { createDemoScanResult } from './musicScanDemo'
import { MUSIC_SCAN_SYSTEM_PROMPT } from './musicScanPrompt'
import type { MusicScanPageImage, MusicScanParseResult } from './musicScanTypes'

export interface MusicScanClientOptions {
  pages: MusicScanPageImage[]
  fileName: string
  mimeType: string
}

export interface MusicScanClientResult {
  parseResult: MusicScanParseResult
  usedDemoParser: boolean
  provider: 'openai' | 'custom' | 'demo'
}

function scanApiUrl(): string | undefined {
  const url = import.meta.env.VITE_MUSIC_SCAN_API_URL
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

function openAiApiKey(): string | undefined {
  const key =
    import.meta.env.VITE_OPENAI_API_KEY ?? import.meta.env.VITE_MUSIC_SCAN_API_KEY
  return typeof key === 'string' && key.length > 0 ? key : undefined
}

function extractJsonFromText(text: string): MusicScanParseResult {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as MusicScanParseResult
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as MusicScanParseResult
    }
    throw new Error('Vision parser did not return valid JSON')
  }
}

async function callCustomScanApi(
  url: string,
  pages: MusicScanPageImage[],
): Promise<MusicScanParseResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: MUSIC_SCAN_SYSTEM_PROMPT,
      pages: pages.map((page) => ({ page: page.page, image: page.dataUrl })),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Scan API failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const payload = (await response.json()) as { result?: MusicScanParseResult } | MusicScanParseResult
  if ('sections' in payload) return payload
  if (payload.result) return payload.result
  throw new Error('Scan API returned unexpected response shape')
}

async function callOpenAiVision(pages: MusicScanPageImage[]): Promise<MusicScanParseResult> {
  const apiKey = openAiApiKey()
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const model = import.meta.env.VITE_MUSIC_SCAN_MODEL ?? 'gpt-4o'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: MUSIC_SCAN_SYSTEM_PROMPT },
            ...pages.map((page) => ({
              type: 'image_url',
              image_url: { url: page.dataUrl, detail: 'high' },
            })),
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    const message =
      typeof detail?.error?.message === 'string' ? detail.error.message : `HTTP ${response.status}`
    throw new Error(`Vision scan failed: ${message}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('Vision scan returned empty content')
  }

  return extractJsonFromText(content)
}

export function isMusicScanConfigured(): boolean {
  return Boolean(scanApiUrl() || openAiApiKey())
}

export async function analyzeMusicPages(
  options: MusicScanClientOptions,
): Promise<MusicScanClientResult> {
  const customUrl = scanApiUrl()
  if (customUrl) {
    const parseResult = await callCustomScanApi(customUrl, options.pages)
    return { parseResult, usedDemoParser: false, provider: 'custom' }
  }

  const apiKey = openAiApiKey()
  if (apiKey) {
    const parseResult = await callOpenAiVision(options.pages)
    return { parseResult, usedDemoParser: false, provider: 'openai' }
  }

  return {
    parseResult: createDemoScanResult(),
    usedDemoParser: true,
    provider: 'demo',
  }
}
