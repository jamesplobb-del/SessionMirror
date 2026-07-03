import { createDemoScanResult } from './musicScanDemo'
import {
  getLocalMusicScanModel,
  getLocalOpenAiApiKey,
  getMusicScanBackendUrl,
  logMusicScanMode,
  type MusicScanMode,
} from './musicScanConfig'
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
  mode: MusicScanMode
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

async function callBackendScanApi(
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

/**
 * LOCAL DEVELOPMENT ONLY — calls OpenAI directly from the browser.
 * Blocked when import.meta.env.PROD is true (see musicScanConfig).
 */
async function callLocalOpenAiVision(pages: MusicScanPageImage[]): Promise<MusicScanParseResult> {
  const apiKey = getLocalOpenAiApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is only available in local development')
  }

  const model = getLocalMusicScanModel()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
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

export { isMusicScanConfigured, resolveMusicScanMode } from './musicScanConfig'
export type { MusicScanMode } from './musicScanConfig'

export async function analyzeMusicPages(
  options: MusicScanClientOptions,
): Promise<MusicScanClientResult> {
  logMusicScanMode('scan')

  const backendUrl = getMusicScanBackendUrl()

  if (backendUrl) {
    const parseResult = await callBackendScanApi(backendUrl, options.pages)
    return { parseResult, usedDemoParser: false, mode: 'backend' }
  }

  const localKey = getLocalOpenAiApiKey()
  if (localKey) {
    const parseResult = await callLocalOpenAiVision(options.pages)
    return { parseResult, usedDemoParser: false, mode: 'local-dev' }
  }

  return {
    parseResult: createDemoScanResult(),
    usedDemoParser: true,
    mode: 'demo',
  }
}
