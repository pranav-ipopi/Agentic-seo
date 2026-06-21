export default function SettingsLoading() {
  return (
    <div className="h-full overflow-y-auto animate-pulse">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <div className="w-24 h-6 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="w-56 h-4 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        {/* Tab pills */}
        <div className="w-48 h-9 rounded-lg bg-gray-200 dark:bg-gray-800" />
        {/* Content card */}
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="w-20 h-5 rounded bg-gray-200 dark:bg-gray-800" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="w-20 h-3 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="w-full h-9 rounded-lg bg-gray-200 dark:bg-gray-800" />
            </div>
          ))}
          <div className="w-28 h-9 rounded-lg bg-indigo-500/20" />
        </div>
      </div>
    </div>
  )
}
