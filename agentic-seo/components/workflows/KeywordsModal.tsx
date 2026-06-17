'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react'

export default function KeywordsModal({
  isOpen,
  onClose,
  clientId
}: {
  isOpen: boolean
  onClose: () => void
  clientId: string
}) {
  const [keywords, setKeywords] = useState<{ id?: string, keyword: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen && clientId) {
      loadKeywords()
    }
  }, [isOpen, clientId])

  const loadKeywords = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/keywords?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setKeywords(data.map((k: any) => ({ id: k.id, keyword: k.keyword })))
      }
    } catch (e) {
      console.error(e)
    }
    setIsLoading(false)
  }

  const handleAddRow = () => {
    setKeywords([...keywords, { keyword: '' }])
  }

  const handleRemoveRow = async (index: number) => {
    const item = keywords[index]
    if (item.id) {
      // Delete from db
      await fetch(`/api/keywords/${item.id}`, { method: 'DELETE' })
    }
    setKeywords(keywords.filter((_, i) => i !== index))
  }

  const handleChange = (index: number, val: string) => {
    const newKw = [...keywords]
    newKw[index].keyword = val
    setKeywords(newKw)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Filter out empties
      const validKw = keywords.filter(k => k.keyword.trim() !== '')
      
      await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: validKw, clientId })
      })
      
      await loadKeywords()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Manage Keywords</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {keywords.map((kw, i) => (
                <div key={kw.id || i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={kw.keyword}
                    onChange={(e) => handleChange(i, e.target.value)}
                    placeholder="Enter target keyword..."
                    className="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                  <button onClick={() => handleRemoveRow(i)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              <button onClick={handleAddRow} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-sm font-medium mt-4">
                <Plus className="w-4 h-4" /> Add Keyword
              </button>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all shadow-md shadow-indigo-900/20">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Keywords
          </button>
        </div>
      </div>
    </div>
  )
}
