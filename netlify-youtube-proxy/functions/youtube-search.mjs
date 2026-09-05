// The Google credential stays on the server. Search runs only on explicit submit.
const cache = new Map()
const requests = new Map()
const origins = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost',
  'https://stalwart-salamander-9451ab.netlify.app'])

export async function handler(event) {
  const origin = event.headers?.origin ?? ''
  const allowed = new Set([...origins, ...(process.env.YOUTUBE_SEARCH_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)])
  const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin' }
  if (allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  const respond = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
  if (origin && !allowed.has(origin)) return respond(403, { error: 'Origin not allowed' })
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' }
  if (event.httpMethod !== 'GET') return respond(405, { error: 'Use GET' })
  const query = (event.queryStringParameters?.q ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)
  if (query.length < 2) return respond(400, { error: 'Enter at least two characters' })
  if (!process.env.YOUTUBE_DATA_API_KEY) return respond(503, { error: 'Search not configured' })
  const now = Date.now()
  const cached = cache.get(query.toLowerCase())
  if (cached && cached.expires > now) return respond(200, cached.data)
  // Best-effort warm-instance limit; configure platform rate limits for production.
  const ip = event.headers?.['x-nf-client-connection-ip'] ?? 'unknown'
  for (const [key, value] of requests) if (value.reset <= now) requests.delete(key)
  const counter = requests.get(ip) ?? { count: 0, reset: now + 60000 }
  if (counter.count >= 10) return respond(429, { error: 'Try again shortly' })
  counter.count++
  requests.set(ip, counter)
  const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8',
    videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'moderate', q: query,
    key: process.env.YOUTUBE_DATA_API_KEY })
  try {
    const result = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!result.ok) return respond(result.status === 403 || result.status === 429 ? 429 : 502, { error: 'YouTube search unavailable' })
    const payload = await result.json()
    const data = { items: (payload.items ?? []).filter(item => /^[\w-]{11}$/.test(item.id?.videoId)).map(item => ({
      videoId: item.id.videoId, title: item.snippet?.title ?? 'YouTube recording', channel: item.snippet?.channelTitle ?? '',
    })) }
    if (cache.size >= 200) cache.delete(cache.keys().next().value)
    cache.set(query.toLowerCase(), { data, expires: now + 15 * 60000 })
    return respond(200, data)
  } catch { return respond(502, { error: 'YouTube search unavailable' }) }
}
