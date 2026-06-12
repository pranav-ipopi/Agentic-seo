'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react'

export default function SiteListModal({
  isOpen,
  onClose,
  category
}: {
  isOpen: boolean
  onClose: () => void
  category: string
}) {
  const [sites, setSites] = useState<{ id?: string, url: string, da: number | '', pa: number | '', spam_score: number | '' }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen && category) {
      loadSites()
    }
  }, [isOpen, category])

  const loadSites = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('target_sites')
      .select('*')
      .eq('category', category)
      .order('created_at', { ascending: true })
      
    if (!error && data) {
      setSites(data.map(s => ({ 
        id: s.id, 
        url: s.url, 
        da: s.da ?? '', 
        pa: s.pa ?? '', 
        spam_score: s.spam_score ?? '' 
      })))
    }
    setIsLoading(false)
  }

  const handleAddRow = () => {
    setSites([...sites, { url: '', da: '', pa: '', spam_score: '' }])
  }

  const handleRemoveRow = async (index: number) => {
    const item = sites[index]
    if (item.id) {
      // Delete from db
      await supabase.from('target_sites').delete().eq('id', item.id)
    }
    setSites(sites.filter((_, i) => i !== index))
  }

  const handleChange = (index: number, field: string, val: string | number) => {
    const newSites = [...sites]
    newSites[index] = { ...newSites[index], [field]: val }
    setSites(newSites)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Filter out empties
      const validSites = sites.filter(s => s.url.trim() !== '')
      
      for (const site of validSites) {
        const payload = {
          url: site.url,
          category: category,
          da: site.da === '' ? null : Number(site.da),
          pa: site.pa === '' ? null : Number(site.pa),
          spam_score: site.spam_score === '' ? null : Number(site.spam_score)
        }

        if (site.id) {
          await supabase.from('target_sites').update(payload).eq('id', site.id)
        } else {
          await supabase.from('target_sites').insert(payload)
        }
      }
      
      await loadSites()
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
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Manage Target Sites ({category})</h3>
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
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-5">URL</div>
                <div className="col-span-2">DA</div>
                <div className="col-span-2">PA</div>
                <div className="col-span-2">Spam Score</div>
                <div className="col-span-1"></div>
              </div>
              {sites.map((site, i) => (
                <div key={site.id || i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={site.url}
                    onChange={(e) => handleChange(i, 'url', e.target.value)}
                    placeholder="https://..."
                    className="col-span-5 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                  <input
                    type="number"
                    value={site.da}
                    onChange={(e) => handleChange(i, 'da', e.target.value)}
                    placeholder="DA"
                    className="col-span-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                  <input
                    type="number"
                    value={site.pa}
                    onChange={(e) => handleChange(i, 'pa', e.target.value)}
                    placeholder="PA"
                    className="col-span-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                  <input
                    type="number"
                    value={site.spam_score}
                    onChange={(e) => handleChange(i, 'spam_score', e.target.value)}
                    placeholder="Spam"
                    className="col-span-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                  <button onClick={() => handleRemoveRow(i)} className="col-span-1 p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              <button onClick={handleAddRow} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-sm font-medium mt-4">
                <Plus className="w-4 h-4" /> Add Site
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
            Save Sites
          </button>
        </div>
      </div>
    </div>
  )
}
