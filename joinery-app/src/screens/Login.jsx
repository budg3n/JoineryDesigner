import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-4xl mb-2">🪵</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Joinery Jobs</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-8">Sign in to continue</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" required />
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full py-2.5 mt-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
