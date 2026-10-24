import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Note, Panel } from '@/components/ui'
import { aiHealth, getAiApiBase, setAiApiBase } from '@/lib/ai'

export function AiConnection() {
  const [address, setAddress] = useState(getAiApiBase)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)
  async function connect() {
    setBusy(true); setMessage(''); setOk(false)
    try {
      setAiApiBase(address)
      const health = await aiHealth()
      if (!health.aiConfigured) throw new Error('The server is reachable, but GEMINI_API_KEY is missing in its environment settings.')
      setOk(true)
      setMessage('Server connected and a key is configured. Ask a Tutor question to verify model access and quota.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed. Check the server address and CORS settings.') }
    finally { setBusy(false) }
  }
  return <Panel title="AI connection" sub="Tutor and Scanner">
    <p className="mb-3 text-[13.5px] text-ink-2">Connect the server once on this device. The server keeps your Gemini key private. Never enter an API key here.</p>
    <Field label="AI server address" type="url" placeholder="https://your-server.onrender.com" value={address} onChange={e => setAddress(e.target.value)} disabled={busy} hint="Use the server origin only, without /api. Leave empty to use the address bundled with the app." />
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="primary" disabled={busy} onClick={() => void connect()}>{busy ? 'Checking connection…' : 'Save & test connection'}</Button>
      <Button disabled={busy} onClick={() => { setAiApiBase(''); setAddress(getAiApiBase()); setMessage('Using the default server address.'); setOk(false) }}>Use default</Button>
      <a className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-accent underline" href="https://github.com/playxgaming/semester-desk-app/blob/main/AI_SETUP.md" target="_blank" rel="noopener noreferrer">AI setup guide</a>
    </div>
    {message && <div role="status"><Note tone={ok ? 'ok' : 'warn'}>{message}</Note></div>}
    <p className="mt-3 text-[12px] text-ink-3">A connection check does not spend model tokens. <Link className="inline-flex min-h-[44px] items-center text-accent underline" to="/tutor">Open AI Tutor</Link> to test an answer.</p>
  </Panel>
}
