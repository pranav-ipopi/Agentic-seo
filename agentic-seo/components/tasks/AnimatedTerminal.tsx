'use client'

import React, { useState, useEffect } from 'react'

const SIMULATED_LOGS = [
  "Initializing headless browser environment...",
  "Navigating to target URL...",
  "Bypassing generic captchas...",
  "Scanning DOM for interactive elements...",
  "Analyzing page structure...",
  "Extracting candidate links...",
  "Evaluating domain authority metrics...",
  "Executing JavaScript interactions...",
  "Filling out submission forms...",
  "Handling modal dialogs...",
  "Awaiting network responses...",
  "Parsing JSON responses...",
  "Taking screenshots for verification...",
  "Closing browser context..."
]

export default function AnimatedTerminal({ isRunning }: { isRunning: boolean }) {
  const [lines, setLines] = useState<string[]>(["[System] Connected to remote browser session."])

  useEffect(() => {
    if (!isRunning) {
      setLines(prev => [...prev, "[System] Session terminated. Execution complete."])
      return
    }

    let currentIndex = 0
    
    const interval = setInterval(() => {
      // Pick a random simulated log or sequential
      const log = SIMULATED_LOGS[currentIndex % SIMULATED_LOGS.length]
      
      setLines(prev => {
        const newLines = [...prev, `[Agent] ${log}`]
        // Keep only the last 6 lines so it doesn't grow forever
        return newLines.slice(-6)
      })

      currentIndex++
    }, 2500) // Add a new line every 2.5 seconds

    return () => clearInterval(interval)
  }, [isRunning])

  return (
    <div className="aspect-video bg-gray-50 dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800 p-4 font-mono text-[10px] leading-relaxed overflow-hidden relative shadow-inner">
      <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-gray-950 to-transparent z-10 pointer-events-none" />
      <div className="flex flex-col justify-end h-full relative z-0">
        <div className="space-y-1.5 transition-all duration-300">
          {lines.map((line, i) => (
            <div 
              key={i} 
              className={`text-emerald-400/90 tracking-wide flex items-start gap-2 ${i === lines.length - 1 && isRunning ? 'animate-pulse' : 'opacity-70'}`}
            >
              <span className="text-gray-400 dark:text-gray-600 select-none">&gt;</span>
              <span className="break-all">{line}</span>
            </div>
          ))}
          {isRunning && (
            <div className="text-emerald-400/50 flex items-start gap-2 animate-pulse mt-1">
              <span className="text-gray-400 dark:text-gray-600 select-none">&gt;</span>
              <span className="w-2 h-3 bg-emerald-400/50 inline-block" />
            </div>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-gray-950 to-transparent z-10 pointer-events-none" />
    </div>
  )
}
