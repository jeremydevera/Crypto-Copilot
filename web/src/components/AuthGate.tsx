import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signUp, signIn } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (loading) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading...</div>
      </div>
    )
  }

  // Signed in or dismissed — show the app
  if (user || dismissed) {
    return <>{children}</>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    if (mode === 'signup') {
      const { error: err } = await signUp(email, password)
      if (err) setError(err)
      else setSuccess('Check your email for a confirmation link!')
    } else {
      const { error: err } = await signIn(email, password)
      if (err) setError(err)
    }
    setSubmitting(false)
  }

  return (
    <div className="h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Trading Copilot</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to sync your settings & trades</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 space-y-4 border border-gray-800">
          {/* Tab switcher */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'signup' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-sm text-green-400">
              {success}
            </div>
          )}

          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-2.5 rounded-lg transition-colors"
          >
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <p className="text-xs text-gray-600 text-center">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null); }}
              className="text-green-400 hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>

        <button
          onClick={() => setDismissed(true)}
          className="w-full text-center text-xs text-gray-600 hover:text-gray-400 mt-4 transition-colors"
        >
          Continue without signing in →
        </button>

        <p className="text-[10px] text-gray-700 text-center mt-4 leading-tight">
          ⚠️ This app is for educational purposes only. Not financial advice.
        </p>
      </div>
    </div>
  )
}