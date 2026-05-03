import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Mail } from 'lucide-react'
import { toast } from 'sonner'
import oneflowLogo from '@/assets/oneflow-logo.webp'

export const Route = createFileRoute('/auth')({
  head: () => ({
    meta: [
      { title: 'Sign in — One Flow' },
      { name: 'description', content: 'Sign in or create your One Flow account.' },
    ],
  }),
  component: AuthPage,
})

async function resolveDestination(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, date_of_birth, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile?.phone || !profile?.date_of_birth) return '/onboarding'
  if (profile.role && profile.role !== 'customer') return '/admin'
  return '/'
}

export default function AuthPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const init = async () => {
      // Exchange PKCE code if present in URL
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code) {
        window.history.replaceState({}, '', '/auth')
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session?.user) {
          const dest = await resolveDestination(data.session.user.id)
          navigate({ to: dest })
          return
        }
      }

      // Check existing session
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) {
        const dest = await resolveDestination(session.user.id)
        navigate({ to: dest })
      }
    }
    void init()
  }, [navigate])

  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupMagicSent, setSignupMagicSent] = useState(false)
  const [signInLinkSent, setSignInLinkSent] = useState(false)

  const sendSignInLink = async () => {
    if (!email.trim()) {
      toast.error('Please enter your email')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setSignInLinkSent(true)
    toast.success('Check your email.')
  }

  const signUpWithEmail = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setSignupMagicSent(true)
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
    }
  }

  if (signInLinkSent) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
        <img src={oneflowLogo} alt="One Flow" className="mb-6 h-14 w-auto" />
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <p className="text-lg font-semibold leading-snug text-foreground">
            Check your email — we sent a sign-in link to <strong className="break-all font-semibold">{email}</strong>.
            Click it to continue.
          </p>
          <button
            type="button"
            onClick={() => setSignInLinkSent(false)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  if (signupMagicSent) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
        <img src={oneflowLogo} alt="One Flow" className="mb-6 h-14 w-auto" />
        <div className="max-w-sm space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <strong>{email}</strong>. Tap it to continue.
          </p>
          <button
            type="button"
            onClick={() => setSignupMagicSent(false)}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <img src={oneflowLogo} alt="One Flow" className="mb-6 h-14 w-auto" />
      <div className="w-full max-w-md">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'signup')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void sendSignInLink()}
                placeholder="you@example.com"
                className="h-11"
              />
            </div>
            <Button onClick={() => void sendSignInLink()} disabled={loading} className="h-11 w-full text-base">
              {loading ? 'Sending…' : 'Send sign-in link'}
            </Button>
            <Divider />
            <Button
              onClick={() => void signInWithGoogle()}
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void signUpWithEmail()}
                placeholder="you@example.com"
                className="h-11"
              />
            </div>
            <Button onClick={() => void signUpWithEmail()} disabled={loading} className="h-11 w-full text-base">
              {loading ? 'Sending…' : 'Continue'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By signing up you agree to our <button type="button" className="underline underline-offset-4">Terms</button> and{' '}
              <button type="button" className="underline underline-offset-4">Privacy Policy</button>.
            </p>
            <Divider />
            <Button
              onClick={() => void signInWithGoogle()}
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </TabsContent>
        </Tabs>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Need help?{' '}
          <a href="https://wa.me/27825533032" className="text-foreground underline-offset-4 hover:underline">
            Contact the studio
          </a>
        </p>
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className="relative py-2">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">or</span>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
