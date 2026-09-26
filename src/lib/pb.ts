import PocketBase from 'pocketbase'

const FLAG = 'tc:pb-enabled'

let pb: PocketBase | null = null

function explicitUrl(): string | null {
  if (typeof import.meta !== 'undefined') {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_PB_URL
    if (v && v.trim()) return v.trim().replace(/\/$/, '')
  }
  return null
}

export function pbUrl(): string {
  if (typeof window !== 'undefined' && (window as unknown as { __PB_URL__?: string }).__PB_URL__) {
    return (window as unknown as { __PB_URL__: string }).__PB_URL__
  }
  return explicitUrl() ?? 'http://127.0.0.1:8090'
}

export function setPbUrl(url: string) {
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __PB_URL__?: string }).__PB_URL__ = url.trim().replace(/\/$/, '')
  }
  pb = null
  resetPbHealth()
}

/**
 * PocketBase is only contacted when explicitly enabled — either via
 * VITE_PB_URL or by flipping the in-browser switch. This keeps the console
 * free of doomed ERR_CONNECTION_REFUSED probes on machines where no
 * PocketBase runs, and makes local mode the honest default.
 */
export function pbEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const flag = localStorage.getItem(FLAG)
  if (flag === '1') return true
  if (flag === '0') return false
  return explicitUrl() !== null
}

export function setPbEnabled(on: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(FLAG, on ? '1' : '0')
  resetPbHealth()
}

export function getPb(): PocketBase | null {
  if (typeof window === 'undefined') return null
  if (!pbEnabled()) return null
  if (!pb) {
    pb = new PocketBase(pbUrl())
    pb.autoCancellation(false)
  }
  return pb
}

let healthCache: { at: number; ok: boolean } | null = null

export async function pbAvailable(timeoutMs = 2500): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!pbEnabled()) return false
  if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache.ok
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${pbUrl()}/api/health`, { signal: ctrl.signal })
    clearTimeout(t)
    healthCache = { at: Date.now(), ok: res.ok }
    return healthCache.ok
  } catch {
    healthCache = { at: Date.now(), ok: false }
    return false
  }
}

export function resetPbHealth() {
  healthCache = null
}
