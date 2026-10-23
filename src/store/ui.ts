import { create } from 'zustand'

interface UiState {
  focusCourseId: string | null
  setFocusCourse: (id: string | null) => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
  toast: {
    id: number
    text: string
    tone: 'ok' | 'warn' | 'crit'
    undo?: () => void | Promise<void>
  } | null
  notify: (
    text: string,
    tone?: 'ok' | 'warn' | 'crit',
    undo?: () => void | Promise<void>,
  ) => void
  dismiss: () => void
}

export const useUi = create<UiState>((set) => ({
  focusCourseId: null,
  setFocusCourse: (id) => set({ focusCourseId: id }),
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
  toast: null,
  notify: (text, tone = 'ok', undo) => {
    const id = Date.now()
    set({ toast: { id, text, tone, undo } })
    // an offer to undo has to outlast the moment of "wait, no"
    window.setTimeout(
      () => set((s) => (s.toast?.id === id ? { toast: null } : s)),
      undo ? 6000 : 3200,
    )
  },
  dismiss: () => set({ toast: null }),
}))
