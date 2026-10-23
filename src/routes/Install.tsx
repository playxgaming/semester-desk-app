import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, ExternalLink, Monitor, Share2, ShieldCheck, Smartphone, WifiOff } from 'lucide-react'
import { Badge, Button, Card, Note, PageHeader } from '@/components/ui'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  available: boolean
  installed: boolean
  busy: boolean
  message: string
  install: () => Promise<void>
}

const InstallContext = createContext<InstallState>({
  available: false,
  installed: false,
  busy: false,
  message: '',
  install: async () => {},
})

function installedOnDevice() {
  const native = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone ||
    native?.isNativePlatform?.(),
  )
}

// Keep the browser's one-use prompt from startup, including before this page opens.
export function InstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(installedOnDevice)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)')
    const update = () => setInstalled(installedOnDevice())
    const capture = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const complete = () => {
      setPrompt(null)
      setInstalled(true)
      setMessage('Semester Desk is installed. Open it from your home screen or app launcher.')
    }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', complete)
    display.addEventListener('change', update)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', complete)
      display.removeEventListener('change', update)
    }
  }, [])

  async function install() {
    if (!prompt || busy) return
    setBusy(true)
    setMessage('')
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setMessage(choice.outcome === 'accepted'
        ? 'Installation started. Look for Semester Desk in your apps.'
        : 'You can install later from your browser menu.')
    } catch {
      setMessage('Use the installation steps below to add Semester Desk from your browser.')
    } finally {
      setPrompt(null)
      setBusy(false)
    }
  }

  return (
    <InstallContext.Provider value={{ available: Boolean(prompt), installed, busy, message, install }}>
      {children}
    </InstallContext.Provider>
  )
}

export default function Install() {
  const { available, installed, busy, message, install } = useContext(InstallContext)
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    let active = true
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(() => {
        if (active) setOfflineReady(true)
      })
    }
    return () => {
      active = false
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Your desk, anywhere"
        title="Take your semester with you."
        lede="Add Semester Desk to your home screen or desktop. Your timetable, deadlines and study plan are always a tap away."
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-7">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-rule bg-accent-soft text-accent">
            <Download size={34} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone="ok"><ShieldCheck size={12} /> No account needed</Badge>
              <Badge tone={offlineReady ? 'ok' : 'neutral'}>
                <WifiOff size={12} />
                {offlineReady ? 'Offline cache ready' : online ? 'Preparing offline access' : 'Open online to prepare offline access'}
              </Badge>
            </div>
            <h2 className="text-[23px]">Semester Desk</h2>
            <p className="mt-1 text-[14px] text-ink-2">One workspace for classes, focus and everything due next.</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={installed || busy}
            onClick={() => {
              if (available) void install()
              else document.getElementById('install-instructions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {installed ? <CheckCircle2 size={17} /> : <Download size={17} />}
            {installed ? 'Installed on this device' : busy ? 'Opening installer…' : available ? 'Install Semester Desk' : 'How to install'}
          </Button>
        </div>
        {message ? <p role="status" className="border-t border-rule px-5 py-3 text-[13.5px] text-ink-2 sm:px-7">{message}</p> : null}
      </Card>

      <div id="install-instructions" className="mt-6 grid scroll-mt-6 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-accent"><Smartphone size={19} /><h2 className="text-[18px] text-ink">On your phone</h2></div>
          <h3 className="text-[14px]">iPhone & iPad</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">Open this site in Safari. Tap <Share2 size={13} className="inline" aria-label="Share" /> Share, choose <strong>Add to Home Screen</strong>, then tap Add.</p>
          <h3 className="mt-4 text-[14px]">Android</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">Open this site in Chrome. Tap <strong>Install Semester Desk</strong> above, or open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-accent"><Monitor size={19} /><h2 className="text-[18px] text-ink">On your computer</h2></div>
          <p className="text-[13.5px] text-ink-2">In Chrome or Edge, use the install icon in the address bar or choose <strong>Install Semester Desk</strong> from the browser menu.</p>
          <p className="mt-3 text-[13.5px] text-ink-2">In Safari on Mac, choose <strong>File → Add to Dock</strong>. If your browser has no install option, you can keep using the app here or open it in Chrome or Edge.</p>
          <a
            href="https://github.com/playxgaming/semester-desk-app/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-medium text-accent underline underline-offset-4"
          >
            Downloads & release notes <ExternalLink size={14} />
          </a>
          <p className="text-[12px] text-ink-3">Find available app packages in GitHub Releases.</p>
        </Card>
      </div>

      <Note title="Ready before you go offline">
        Open the app online once and let it finish loading before going offline. Your study data is stored on this device. AI Tutor, scanning and optional sync need an internet connection; AI features also need a configured AI server.
      </Note>
      <p className="text-[13px] text-ink-3">Moving to a new device? <Link to="/settings" className="inline-flex min-h-[44px] items-center text-accent underline underline-offset-4">Export a backup in Settings</Link> and import it on your new device.</p>
    </>
  )
}
