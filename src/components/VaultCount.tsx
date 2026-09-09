import { useEffect, useState } from 'react'
import { initVaultDatabase } from '../db/connection'
export default function VaultCount({ revision }: { revision?: number }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function refresh() {
      try { const db = await initVaultDatabase(); const result = await db.query('SELECT COUNT(*) AS total FROM takes'); if (active) setCount(Number(result.values?.[0]?.total ?? 0)) } catch { if (active) setCount(null) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [revision])
  return count === null ? null : <span key={count} className="electric-vault-count" aria-label={`${count} saved takes`}>{count}</span>
}
