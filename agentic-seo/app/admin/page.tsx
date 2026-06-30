'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, Lock, TrendingUp, AlertCircle, CheckCircle2, IndianRupee, Globe2, LogOut, BarChart3, Activity, Cpu, Server } from 'lucide-react'
import { fetchAdminStats, updateAdminLimit, fetchAnalyticsData } from './actions'

type ClientStats = {
  id: string
  name: string
  domain: string
  backlink_limit: number | null
  completed: number
  failed: number
  pending: number
}

export default function AdminClientsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [clients, setClients] = useState<ClientStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null)
  const [limitInput, setLimitInput] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'management' | 'analytics'>('management')
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  
  // Configuration State
  const [usdToInr, setUsdToInr] = useState(94)
  const [vpsCostUsd, setVpsCostUsd] = useState(0)
  const [proxyPriceUsd, setProxyPriceUsd] = useState(2)
  const [proxyMb, setProxyMb] = useState(5)
  const [captchaPriceUsd, setCaptchaPriceUsd] = useState(1)
  const [captchaCount, setCaptchaCount] = useState(2)
  const [globalLimit, setGlobalLimitInput] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    loadClients(passwordInput)
  }

  const loadClients = async (pass: string) => {
    setIsLoading(true)
    try {
      const stats = await fetchAdminStats(pass)
      setClients(stats as ClientStats[])
      const analytics = await fetchAnalyticsData(pass)
      setAnalyticsData(analytics)
      setIsAuthenticated(true)
    } catch (error: any) {
      alert('Incorrect password or failed to load data')
      setPasswordInput('')
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateLimit = async (clientId: string) => {
    try {
      const limitValue = limitInput === '' || limitInput === null ? null : parseInt(limitInput, 10)
      await updateAdminLimit(passwordInput, clientId, limitValue)
      alert('Limit updated successfully')
      setEditingLimitId(null)
      loadClients(passwordInput)
    } catch (error: any) {
      alert(error.message)
    }
  }

  const handleGlobalLimit = async () => {
    try {
      const limitValue = globalLimit === '' ? null : parseInt(globalLimit, 10)
      const { setGlobalLimit } = await import('./actions')
      await setGlobalLimit(passwordInput, limitValue)
      alert('Global limit updated successfully')
      setGlobalLimitInput('')
      loadClients(passwordInput)
    } catch (error: any) {
      alert(error.message)
    }
  }

  // --- Calculations ---
  const totalCompleted = clients.reduce((acc, c) => acc + c.completed, 0)
  const totalFailed = clients.reduce((acc, c) => acc + c.failed, 0)
  const totalPending = clients.reduce((acc, c) => acc + c.pending, 0)
  const totalExecuted = totalCompleted + totalFailed

  const globalSuccessRate = totalExecuted > 0 
    ? ((totalCompleted / totalExecuted) * 100).toFixed(1) + '%' 
    : '0%'

  const variableCostUsdPerTask = (proxyPriceUsd / 1024 * proxyMb) + (captchaPriceUsd / 1000 * captchaCount)
  const variableCostInrPerTask = variableCostUsdPerTask * usdToInr
  const globalVpsInr = vpsCostUsd * usdToInr

  const totalVariableCostInr = totalExecuted * variableCostInrPerTask
  const totalCostInr = globalVpsInr + totalVariableCostInr
  const costPerSuccessfulInr = totalCompleted > 0 ? (totalCostInr / totalCompleted) : 0

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-800">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Lock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-6">Admin Access</h1>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter admin password"
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          />
          <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors">
            Enter Dashboard
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</h2>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          <button onClick={() => setActiveTab('management')} className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'management' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
            Management
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'analytics' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
            Analytics
          </button>
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => {
              setIsAuthenticated(false)
              setPasswordInput('')
            }}
            className="flex items-center w-full px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'management' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Management</h1>
                <p className="text-gray-500 mt-2">Comprehensive cost analysis and daily client limits.</p>
              </div>
          <button 
            onClick={() => loadClients(passwordInput)} 
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Refresh Data
          </button>
        </div>

        {/* Global Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h3 className="font-medium text-sm">Total Successful</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalCompleted}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="font-medium text-sm">Total Failed</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalFailed}</div>
            <div className="text-xs text-gray-400 mt-1">Cost consumed: ₹{(totalFailed * variableCostInrPerTask).toFixed(2)}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              <h3 className="font-medium text-sm">Overall Success Rate</h3>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{globalSuccessRate}</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-5 rounded-xl border border-indigo-500 shadow-sm text-white">
            <div className="flex items-center gap-3 mb-2 text-indigo-100">
              <IndianRupee className="w-5 h-5" />
              <h3 className="font-medium text-sm">Cost / Successful Backlink</h3>
            </div>
            <div className="text-3xl font-bold">₹{costPerSuccessfulInr.toFixed(2)}</div>
            <div className="text-xs text-indigo-200 mt-1">Total Est. Cost: ₹{totalCostInr.toFixed(2)}</div>
          </div>
        </div>

        {/* Configurations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-2 bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-indigo-500" />
              Pricing & Resource Configuration
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Exchange Rate</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400">₹</span>
                  <input type="number" value={usdToInr} onChange={e => setUsdToInr(Number(e.target.value))} className="w-full pl-6 pr-2 py-1.5 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Global VPS (Month)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400">$</span>
                  <input type="number" value={vpsCostUsd} onChange={e => setVpsCostUsd(Number(e.target.value))} className="w-full pl-6 pr-2 py-1.5 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                </div>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Proxy Price (/GB)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-gray-400">$</span>
                    <input type="number" step="0.01" value={proxyPriceUsd} onChange={e => setProxyPriceUsd(Number(e.target.value))} className="w-full pl-6 pr-2 py-1.5 text-sm border rounded-lg dark:bg-white/5 dark:border-gray-700 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Proxy Data (/Task)</label>
                  <div className="relative">
                    <span className="absolute right-2.5 top-1.5 text-xs text-gray-400">MB</span>
                    <input type="number" step="0.1" value={proxyMb} onChange={e => setProxyMb(Number(e.target.value))} className="w-full pl-2 pr-8 py-1.5 text-sm border rounded-lg dark:bg-white/5 dark:border-gray-700 dark:text-white" />
                  </div>
                </div>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Captcha Price (/1k)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-gray-400">$</span>
                    <input type="number" step="0.01" value={captchaPriceUsd} onChange={e => setCaptchaPriceUsd(Number(e.target.value))} className="w-full pl-6 pr-2 py-1.5 text-sm border rounded-lg dark:bg-white/5 dark:border-gray-700 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Captchas (/Task)</label>
                  <input type="number" step="0.1" value={captchaCount} onChange={e => setCaptchaCount(Number(e.target.value))} className="w-full px-2 py-1.5 text-sm border rounded-lg dark:bg-white/5 dark:border-gray-700 dark:text-white" />
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-400 text-right">
              Variable cost per task: ₹{variableCostInrPerTask.toFixed(4)}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold mb-4 text-gray-900 dark:text-white">Global Daily Limit Overwrite</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Set daily backlink limit for all clients</label>
                <input type="number" placeholder="Unlimited" value={globalLimit} onChange={e => setGlobalLimitInput(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button onClick={handleGlobalLimit} className="w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                Apply to All Clients
              </button>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Client</th>
                  <th className="px-6 py-4 font-medium">Domain</th>
                  <th className="px-6 py-4 font-medium">Daily Limit</th>
                  <th className="px-6 py-4 font-medium text-right">Successful</th>
                  <th className="px-6 py-4 font-medium text-right">Failed</th>
                  <th className="px-6 py-4 font-medium text-right">Pending</th>
                  <th className="px-6 py-4 font-medium text-right">Success Rate</th>
                  <th className="px-6 py-4 font-medium text-right">Variable Cost</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center">No clients found</td>
                  </tr>
                ) : (
                  clients.map((client) => {
                    const executed = client.completed + client.failed
                    const successRate = executed > 0 ? ((client.completed / executed) * 100).toFixed(1) + '%' : 'N/A'
                    const varCost = executed * variableCostInrPerTask

                    return (
                      <tr key={client.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{client.name}</td>
                        <td className="px-6 py-4">{client.domain || 'N/A'}</td>
                        <td className="px-6 py-4">
                          {editingLimitId === client.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                className="w-20 px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 focus:ring-1 focus:ring-indigo-500" 
                                placeholder="Unlmt"
                                value={limitInput}
                                onChange={(e) => setLimitInput(e.target.value)}
                              />
                              <button onClick={() => handleUpdateLimit(client.id)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">Save</button>
                              <button onClick={() => setEditingLimitId(null)} className="px-2 py-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded text-xs hover:bg-gray-300">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 group">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {client.backlink_limit === null ? 'Unlimited' : client.backlink_limit}
                              </span>
                              <button 
                                onClick={() => {
                                  setLimitInput(client.backlink_limit === null ? '' : String(client.backlink_limit))
                                  setEditingLimitId(client.id)
                                }}
                                className="text-indigo-600 dark:text-indigo-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-green-600 dark:text-green-400">{client.completed}</td>
                        <td className="px-6 py-4 text-right font-medium text-red-500">{client.failed}</td>
                        <td className="px-6 py-4 text-right text-yellow-600 dark:text-yellow-500">{client.pending}</td>
                        <td className="px-6 py-4 text-right">{successRate}</td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-gray-300">₹{varCost.toFixed(2)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'analytics' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Analytics</h1>
              <p className="text-gray-500 mt-2">Worker health and job execution metrics.</p>
            </div>
            <button 
              onClick={() => loadClients(passwordInput)} 
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Refresh Data
            </button>
          </div>
          
          {analyticsData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-gray-500 mb-1"><Activity className="w-4 h-4"/> <span className="font-medium text-sm">Currently Running Jobs</span></div>
                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{analyticsData.currentlyRunning}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-gray-500 mb-1"><Server className="w-4 h-4"/> <span className="font-medium text-sm">Total Lifetime Jobs</span></div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{analyticsData.totalJobs}</div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                  <h3 className="font-medium text-sm text-gray-500 mb-4 flex items-center gap-2"><Cpu className="w-4 h-4"/> Worker Health (VPS)</h3>
                  <div className="space-y-3">
                    {analyticsData.workerHealth.map((worker: any) => (
                      <div key={worker.name} className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${worker.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {worker.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Memory: {worker.memory} • Restarts: {worker.restarts}</div>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-md ${worker.status === 'online' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>{worker.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
                <h3 className="font-medium text-sm text-gray-500 mb-6 flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Backlink Execution (Last 7 Days)</h3>
                <div className="h-64 flex items-end justify-between gap-2 px-2">
                  {analyticsData.graphData.map((day: any) => {
                    const total = day.success + day.failed
                    const maxTotal = Math.max(...analyticsData.graphData.map((d: any) => d.success + d.failed), 1)
                    const heightPct = (total / maxTotal) * 100
                    const successPct = total > 0 ? (day.success / total) * 100 : 0
                    const failedPct = total > 0 ? (day.failed / total) * 100 : 0
                    
                    return (
                      <div key={day.date} className="flex flex-col items-center flex-1 group">
                        <div className="w-full relative bg-gray-100 dark:bg-gray-800 rounded-t-sm flex flex-col justify-end overflow-hidden" style={{ height: `${heightPct}%`, minHeight: '4px' }}>
                          <div className="w-full bg-red-400 transition-all duration-300" style={{ height: `${failedPct}%` }}></div>
                          <div className="w-full bg-green-500 transition-all duration-300" style={{ height: `${successPct}%` }}></div>
                          
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                            <div>Success: {day.success}</div>
                            <div>Failed: {day.failed}</div>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2 rotate-45 md:rotate-0 origin-left md:origin-center">{day.date.split('-').slice(1).join('/')}</div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-center gap-6 mt-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> Successful</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500"><span className="w-3 h-3 bg-red-400 rounded-sm"></span> Failed</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
        </main>
      </div>
    </div>
  )
}
