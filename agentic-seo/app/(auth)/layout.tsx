import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Agentic SEO workspace',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-gray-50 dark:bg-gray-950" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Agentic SEO</span>
          </div>
          <p className="text-gray-400 dark:text-gray-600 dark:text-gray-400 text-sm">AI-Powered Multi-Client SEO Workspace</p>
        </div>
        {children}
      </div>
    </div>
  )
}
