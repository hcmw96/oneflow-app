import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

async function resolveDestination(userId: string): Promise<'/onboarding' | '/admin' | '/'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, date_of_birth, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || !profile.phone || !profile.date_of_birth) return '/onboarding'
  if (profile.role && profile.role !== 'customer') return '/admin'
  return '/'
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let unsub: (() => void) | undefined

    const run = async () => {
      if (done.current) return

      const savedHash =
        typeof sessionStorage !== 'undefined'
          ? (sessionStorage.getItem('supabase_hash') ?? window.location.hash)
          : window.location.hash
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('supabase_hash')
      }
      const hash = savedHash.substring(1)
      const hashParams = new URLSearchParams(hash)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token') ?? ''

      if (accessToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!error && data.session?.user) {
          done.current = true
          const dest = await resolveDestination(data.session.user.id)
          navigate({ to: dest })
          return
        }
      }

      await new Promise((r) => setTimeout(r, 1000))
      if (done.current) return

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) {
        done.current = true
        const dest = await resolveDestination(session.user.id)
        navigate({ to: dest })
        return
      }

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (done.current) return
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          done.current = true
          data.subscription.unsubscribe()
          const dest = await resolveDestination(session.user.id)
          navigate({ to: dest })
        }
      })
      unsub = () => data.subscription.unsubscribe()

      timeoutId = setTimeout(() => {
        if (!done.current) {
          done.current = true
          data.subscription.unsubscribe()
          navigate({ to: '/auth' })
        }
      }, 8000)
    }

    void run()

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      unsub?.()
    }
  }, [navigate])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}
