import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Agentic SEO — AI-Powered SEO Workspace',
    template: '%s | Agentic SEO',
  },
  description:
    'Multi-client AI SEO workspace powered by Hermes Agent. Run SEO research, track tasks, and manage approvals in real time.',
  keywords: ['SEO', 'AI', 'Hermes', 'workspace', 'multi-client'],
  openGraph: {
    title: 'Agentic SEO',
    description: 'AI-Powered Multi-Client SEO Workspace',
    type: 'website',
  },
}

import { ThemeProvider } from '@/components/ThemeProvider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        <ThemeProvider
          attribute="class"
          forcedTheme="light"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
