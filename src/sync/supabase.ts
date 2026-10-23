import type { Session, SupabaseClient } from '@supabase/supabase-js'

/**
 * Sync is entirely optional. With no env vars set the app is a private,
 * offline, single-device tool — and, importantly, the Supabase client is
 * never even downloaded: it is behind a dynamic import, so a local-only
 * install pays nothing for a feature it does not use.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const SUPABASE_CONFIGURED = Boolean(url && anon && url.startsWith('http'))

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null
let session: Session | null = null

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!SUPABASE_CONFIGURED) return null
  if (client) return client
  if (!loading) {
    loading = import('@supabase/supabase-js').then(async ({ createClient }) => {
      client = createClient(url!, anon!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
      const { data } = await client.auth.getSession()
      session = data.session
      client.auth.onAuthStateChange((_e, s) => {
        session = s
      })
      return client
    })
  }
  return loading
}

export function getSession(): Session | null {
  return session
}

export function getUserId(): string | null {
  return session?.user?.id ?? null
}

/** True only when there is both a configured project and a signed-in user. */
export function syncEnabled(): boolean {
  return Boolean(client && session)
}

export async function signInWithEmail(email: string) {
  const sb = await getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
}

export async function signOut() {
  const sb = await getSupabase()
  await sb?.auth.signOut()
}
