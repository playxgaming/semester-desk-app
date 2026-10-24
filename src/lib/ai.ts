/** Only the public API server address is stored here; API keys stay server-side. */
const configuredBase = ((import.meta.env.VITE_AI_API_URL as string | undefined) || '').replace(/\/$/, '')
const setting = 'semester-desk:ai-server'
export const AI_CONNECTION_EVENT = 'semester-desk:ai-connection-changed'

export function getAiApiBase(): string {
  try { return localStorage.getItem(setting) || configuredBase } catch { return configuredBase }
}

export function setAiApiBase(value: string): void {
  const text = value.trim()
  if (!text) { localStorage.removeItem(setting); window.dispatchEvent(new Event(AI_CONNECTION_EVENT)); return }
  let url: URL
  try { url = new URL(text) } catch { throw new Error('Enter the full HTTPS address of your AI server.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use an HTTPS server origin, such as https://your-server.onrender.com, without /api, credentials, or query parameters.')
  }
  localStorage.setItem(setting, url.origin)
  window.dispatchEvent(new Event(AI_CONNECTION_EVENT))
}

export async function aiHealth(): Promise<{ aiConfigured: boolean }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${getAiApiBase()}/api/health`, { signal: controller.signal, cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data || typeof data.aiConfigured !== 'boolean') throw new Error('No AI server found. Add your HTTPS backend address in Settings → AI connection.')
    return data
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The AI server did not respond in time. It may be starting up; wait briefly and retry.')
    if (error instanceof TypeError) throw new Error('Cannot reach the AI server. Check its HTTPS address, your connection, and the server CORS settings.')
    throw error
  } finally { clearTimeout(timeout) }
}

export async function aiRequest<T>(path: string, body: object | FormData, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 75_000)
  try {
    const form = body instanceof FormData
    const response = await fetch(`${getAiApiBase()}/api/${path}`, {
      method: 'POST', signal: controller.signal,
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: form ? body : JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'AI server unavailable. Check Settings → AI connection and try again.')
    if (!data || !('result' in data)) throw new Error('The AI server returned an invalid response.')
    return data.result as T
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timedOut ? 'The AI request timed out. The server may be starting up; please retry.' : 'Request cancelled. Your question is still here.')
    if (error instanceof TypeError) throw new Error('Cannot reach the AI server. Check your internet connection and Settings → AI connection. Your offline planner still works.')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
