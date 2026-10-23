import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  CircleDot,
  GraduationCap,
  LayoutGrid,
  ListTodo,
  NotebookPen,
  Settings as SettingsIcon,
  Timer,
  UserCheck,
  Layers,
  Briefcase,
  FileText,
  Wallet,
  Compass,
  Command,
  MoreHorizontal,
  Search,
  SunMoon,
  Brain,
  Download,
} from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useUi } from '@/store/ui'
import { useProfile } from '@/hooks/data'
import { saveProfile } from '@/db/mutate'
import { Modal } from '@/components/ui'
import { CommandPalette } from '@/components/CommandPalette'
import { Onboarding } from '@/components/Onboarding'

const NAV = [
  { to: '/', label: 'Today', icon: LayoutGrid, end: true },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/attendance', label: 'Attendance', icon: UserCheck },
  { to: '/tasks', label: 'Deadlines', icon: ListTodo },
  { to: '/grades', label: 'Grades', icon: GraduationCap },
  { to: '/planner', label: 'Planner', icon: CheckSquare },
  { to: '/review', label: 'Review', icon: Layers },
  { to: '/coach', label: 'Coach', icon: Compass },
  { to: '/tutor', label: 'AI Tutor', icon: Brain },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/install', label: 'Install app', icon: Download },
]

const CAREER_NAV = [
  { to: '/applications', label: 'Applications', icon: Briefcase, end: false },
  { to: '/resume', label: 'Resume', icon: FileText, end: false },
  { to: '/money', label: 'Money', icon: Wallet, end: false },
]

// Four destinations plus More. Everything else is one tap away in the sheet —
// what is not acceptable is a route you cannot reach at all from a phone,
// which is what a five-slot bar without an overflow gives you.
const MOBILE_TABS = [
  NAV[0], // Today
  NAV[3], // Deadlines
  NAV[5], // Planner
  NAV[6], // Review
]

function StoragePill() {
  const [reminders, setReminders] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { permissionState, isNative } = await import('@/lib/notify')
      if (cancelled) return
      if ((await permissionState()) !== 'granted' || !isNative()) {
        setReminders(null)
        return
      }
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const pending = await LocalNotifications.getPending()
      if (!cancelled) setReminders(pending.notifications.length)
    })().catch(() => setReminders(null))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <span
      className="chip"
      title="Study data lives on this device. AI features use a server; optional sync can be configured in Settings."
    >
      <CircleDot size={11} className="text-ok" />
      <span>{reminders === null ? 'On this device' : `${reminders} reminders set`}</span>
    </span>
  )
}

function ThemeToggle() {
  const profile = useProfile()
  const next = profile.theme === 'dark' ? 'light' : profile.theme === 'light' ? 'system' : 'dark'
  return (
    <button
      type="button"
      className="chip capitalize"
      title={`Theme: ${profile.theme}. Click for ${next}.`}
      onClick={() => void saveProfile({ theme: next })}
    >
      {profile.theme}
    </button>
  )
}

function Toast() {
  const toast = useUi((s) => s.toast)
  if (!toast) return null
  return (
    <div
      role="status"
      className={clsx(
        'fixed bottom-24 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded border px-4 py-2.5 text-[13.5px] shadow-card md:bottom-8',
        toast.tone === 'ok' && 'border-ok bg-[color:var(--ok-soft)] text-ok',
        toast.tone === 'warn' && 'border-warn bg-[color:var(--warn-soft)] text-warn',
        toast.tone === 'crit' && 'border-crit bg-[color:var(--crit-soft)] text-crit',
      )}
    >
      <span className="min-w-0">{toast.text}</span>
      {toast.undo ? (
        <button
          type="button"
          className="-my-2 shrink-0 py-2 font-semibold underline underline-offset-2"
          onClick={async () => {
            const fn = toast.undo!
            useUi.getState().dismiss()
            await fn()
          }}
        >
          Undo
        </button>
      ) : null}
    </div>
  )
}


/**
 * The phone's navigation. Four tabs for what you touch daily, and a sheet for
 * everything else — grouped the same way the sidebar is, so the two do not
 * teach different mental models.
 */
function MobileNav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const inTabs = MOBILE_TABS.some((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)))

  const groups: { label: string; items: typeof NAV }[] = [
    { label: 'Semester', items: NAV },
    { label: 'Beyond the semester', items: CAREER_NAV },
  ]

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface/95 backdrop-blur md:hidden"
        aria-label="Main"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}
      >
        {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px]',
                isActive ? 'text-accent' : 'text-ink-3',
              )
            }
          >
            <Icon size={19} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={clsx(
            'flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px]',
            open || !inTabs ? 'text-accent' : 'text-ink-3',
          )}
        >
          <MoreHorizontal size={19} strokeWidth={1.8} />
          More
        </button>
      </nav>

      <Modal open={open} onClose={() => setOpen(false)} title="Everything else">
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="eyebrow mb-2">{g.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      clsx(
                        'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded border px-1 text-center text-[12px]',
                        isActive
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-rule bg-surface text-ink-2',
                      )
                    }
                  >
                    <Icon size={19} strokeWidth={1.7} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="eyebrow mb-2">System</div>
            <div className="grid grid-cols-3 gap-2">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded border px-1 text-center text-[12px]',
                    isActive
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-rule bg-surface text-ink-2',
                  )
                }
              >
                <SettingsIcon size={19} strokeWidth={1.7} />
                Settings
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  useUi.getState().setCommandOpen(true)
                }}
                className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded border border-rule bg-surface px-1 text-center text-[12px] text-ink-2"
              >
                <Search size={19} strokeWidth={1.7} />
                Search
              </button>
              <ThemeTile />
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}

function ThemeTile() {
  const profile = useProfile()
  const next = profile.theme === 'dark' ? 'light' : profile.theme === 'light' ? 'system' : 'dark'
  return (
    <button
      type="button"
      onClick={() => void saveProfile({ theme: next })}
      className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded border border-rule bg-surface px-1 text-center text-[12px] capitalize text-ink-2"
    >
      <SunMoon size={19} strokeWidth={1.7} />
      {profile.theme}
    </button>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[1240px] gap-8 px-4 pb-24 md:px-7 md:pb-12">
      <aside className="sticky top-0 hidden h-screen w-[198px] shrink-0 flex-col py-7 md:flex">
        <div className="mb-7 px-3">
          <div className="eyebrow text-accent">Semester Desk</div>
          <p className="mt-0.5 font-display text-[15px] font-bold leading-tight">Everything, one place</p>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Sections">
          <span className="eyebrow px-3 pb-1">Semester</span>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded px-3 py-[7px] text-[13.5px] transition',
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
          <span className="eyebrow px-3 pb-1 pt-4">Beyond the semester</span>
          {CAREER_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded px-3 py-[7px] text-[13.5px] transition',
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex flex-col items-start gap-2 px-3">
          <StoragePill />
          <div className="flex gap-2">
            <ThemeToggle />
            <NavLink
              to="/settings"
              className="chip inline-flex items-center gap-1.5 hover:border-rule-2"
              title="Settings"
            >
              <SettingsIcon size={11} /> Settings
            </NavLink>
          </div>
          <button
            type="button"
            className="chip hover:border-rule-2"
            onClick={() => useUi.getState().setCommandOpen(true)}
            title="Jump anywhere"
          >
            <Command size={11} /> Ctrl K
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 py-4 md:py-9">
        <div
          className="-mx-4 mb-4 flex items-center gap-2 border-b border-rule bg-ground/95 px-4 pb-2.5 backdrop-blur md:hidden"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
        >
          <div className="eyebrow flex-1 text-accent">Semester Desk</div>
          <StoragePill />
          <button
            type="button"
            aria-label="Search and commands"
            className="flex h-9 w-9 items-center justify-center rounded border border-rule bg-surface text-ink-2"
            onClick={() => useUi.getState().setCommandOpen(true)}
          >
            <Search size={15} />
          </button>
        </div>
        <Outlet />
      </main>

      <MobileNav />

      <Toast />
      <CommandPalette />
      <Onboarding />
    </div>
  )
}
