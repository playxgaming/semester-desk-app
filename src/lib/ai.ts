/** The API key belongs on the server. This is only its public base URL. */
const base = ((import.meta.env.VITE_AI_API_URL as string | undefined) || '').replace(/\/$/, '')

export async function aiRequest<T>(path: string, body: object | FormData): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const form = body instanceof FormData
    const response = await fetch(`${base}/api/${path}`, {
      method: 'POST', signal: controller.signal,
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: form ? body : JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'AI server unavailable. Check the server setup and try again.')
    if (!data || !('result' in data)) throw new Error('The AI server returned an invalid response.')
    return data.result as T
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Cannot reach the AI server. Check your connection and server setup. Your offline planner still works.')
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The AI request timed out. Please try again.')
    throw error
  } finally { clearTimeout(timeout) }
}
