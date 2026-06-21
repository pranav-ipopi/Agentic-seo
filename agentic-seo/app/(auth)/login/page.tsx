'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mail, Lock, Eye, EyeOff, Building } from 'lucide-react'
import type { Metadata } from 'next'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState('seo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { department: selectedDomain, full_name: fullName }
          },
        })
        if (error) throw error
        setMessage('Check your email to confirm your account.')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        })
        if (error) throw error
        setMessage('Password reset link sent to your email.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-8 shadow-2xl shadow-black/50">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
          {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-600 dark:text-gray-400">
          {mode === 'login'
            ? 'Welcome back to your workspace'
            : mode === 'signup'
            ? 'Start your SEO workspace'
            : 'Enter your email to reset password'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        {mode === 'signup' && (
          <>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Full Name
              </label>
              <div className="relative mb-4">
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label htmlFor="domain" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Domain / Department
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
                <select
                  id="domain"
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors appearance-none cursor-pointer"
                >
                  <option value="seo">SEO</option>
                  <option value="design" disabled>Design</option>
                  <option value="executive" disabled>Executive</option>
                </select>
              </div>
            </div>
          </>
        )}

        {mode !== 'forgot' && (
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-500" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fade-in">
            {message}
          </div>
        )}

        <button
          id="submit-auth"
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-center text-sm">
        {mode === 'login' && (
          <>
            <button
              onClick={() => { setMode('forgot'); setError(null); setMessage(null) }}
              className="text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-indigo-400 transition-colors"
            >
              Forgot password?
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setMessage(null) }}
              className="text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Don&apos;t have an account? <span className="text-indigo-400">Sign up</span>
            </button>
          </>
        )}
        {(mode === 'signup' || mode === 'forgot') && (
          <button
            onClick={() => { setMode('login'); setError(null); setMessage(null) }}
            className="text-gray-400 dark:text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
